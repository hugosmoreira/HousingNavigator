import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProfileRequestTracker,
  RemoteSignOutError,
  clearPersistedSupabaseSession,
  isCurrentAuthProfile,
  profileActionForAuthEvent,
  remoteRevokeIncomplete,
  signOutSafely,
  supabaseAuthStorageKey,
} from './authSession';

const URL_ = 'https://project-ref.supabase.co';
const KEY = 'sb-project-ref-auth-token';

function fakeStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function fakeClient({
  local = async () => ({ error: null }),
  remote = async () => ({ data: null, error: null }),
}: {
  local?: (...args: unknown[]) => Promise<unknown>;
  remote?: (...args: unknown[]) => Promise<unknown>;
} = {}) {
  const localSignOut = vi.fn(local);
  const remoteSignOut = vi.fn(remote);
  const client = {
    auth: { signOut: localSignOut, admin: { signOut: remoteSignOut } },
  } as unknown as SupabaseClient;
  return { client, localSignOut, remoteSignOut };
}

const authError = (status: number) => Object.assign(new Error(`status ${status}`), { status });

describe('persisted Supabase session', () => {
  it('derives the auth-js storage key and clears every key it writes', () => {
    expect(supabaseAuthStorageKey(URL_)).toBe(KEY);
    const storage = fakeStorage({
      [KEY]: 'session',
      [`${KEY}-code-verifier`]: 'verifier',
      [`${KEY}-user`]: 'user',
      unrelated: 'keep',
    });
    clearPersistedSupabaseSession(URL_, storage);
    expect([...storage.values.entries()]).toEqual([['unrelated', 'keep']]);
  });

  it('keeps clearing the other keys when one removal throws', () => {
    const removed: string[] = [];
    clearPersistedSupabaseSession(URL_, {
      removeItem(key: string) {
        if (key === KEY) throw new Error('quota');
        removed.push(key);
      },
    });
    expect(removed).toEqual([`${KEY}-code-verifier`, `${KEY}-user`]);
  });
});

describe('signOutSafely', () => {
  it('removes the stored session before the SDK runs and revokes other sessions', async () => {
    const storage = fakeStorage({ [KEY]: 'session' });
    let storedDuringLocalSignOut: boolean | null = null;
    const { client, localSignOut, remoteSignOut } = fakeClient({
      local: async () => {
        storedDuringLocalSignOut = storage.values.has(KEY);
        return { error: null };
      },
    });

    const result = await signOutSafely(client, URL_, { accessToken: 'token', storage });

    expect(result.remote).toBe('revoked');
    expect(storedDuringLocalSignOut).toBe(false);
    expect(localSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(remoteSignOut).toHaveBeenCalledWith('token', 'global');
    expect(remoteRevokeIncomplete(result)).toBe(false);
  });

  it('keeps this browser signed out when the server revoke fails', async () => {
    const storage = fakeStorage({ [KEY]: 'session' });
    const { client } = fakeClient({
      remote: async () => ({ data: null, error: authError(500) }),
    });

    const result = await signOutSafely(client, URL_, { accessToken: 'token', storage, timeoutMs: 50 });

    expect(storage.values.has(KEY)).toBe(false);
    expect(result.remote).toBe('failed');
    expect(remoteRevokeIncomplete(result)).toBe(true);
  });

  it('clears the session again when a token refresh writes it back mid sign-out', async () => {
    const storage = fakeStorage({ [KEY]: 'session' });
    const { client, remoteSignOut } = fakeClient({
      // A refresh that was already running saves a new session, then the
      // SDK's own sign-out fails.
      local: async () => {
        storage.setItem(KEY, 'refreshed-session');
        return { error: authError(500) };
      },
    });

    const result = await signOutSafely(client, URL_, { accessToken: 'token', storage });

    expect(storage.values.has(KEY)).toBe(false);
    // The server revoke is still attempted after a failed local step.
    expect(remoteSignOut).toHaveBeenCalledWith('token', 'global');
    expect(result.remote).toBe('revoked');
  });

  it('does not wait on a hung SDK call before finishing', async () => {
    const storage = fakeStorage({ [KEY]: 'session' });
    const { client } = fakeClient({ local: () => new Promise(() => {}) });

    const result = await signOutSafely(client, URL_, { accessToken: null, storage, timeoutMs: 20 });

    expect(storage.values.has(KEY)).toBe(false);
    expect(result.remote).toBe('skipped');
  });

  it('treats a session the server already ended as signed out', async () => {
    for (const status of [403, 404]) {
      const { client } = fakeClient({ remote: async () => ({ data: null, error: authError(status) }) });
      const result = await signOutSafely(client, URL_, { accessToken: 'token', storage: fakeStorage({}) });
      expect(result.remote).toBe('already-ended');
      expect(remoteRevokeIncomplete(result)).toBe(false);
    }
  });

  it('reports a rejected token instead of claiming other devices were signed out', async () => {
    const { client } = fakeClient({ remote: async () => ({ data: null, error: authError(401) }) });
    const result = await signOutSafely(client, URL_, { accessToken: 'stale', storage: fakeStorage({}) });
    expect(result.remote).toBe('token-rejected');
    expect(remoteRevokeIncomplete(result)).toBe(true);
  });

  it('skips the server revoke when there is no access token', async () => {
    const { client, remoteSignOut } = fakeClient();
    const result = await signOutSafely(client, URL_, { accessToken: null, storage: fakeStorage({}) });
    expect(result.remote).toBe('skipped');
    expect(remoteSignOut).not.toHaveBeenCalled();
  });

  it('gives a plain-language error for an incomplete revoke', () => {
    const error = new RemoteSignOutError('failed');
    expect(error.message).toMatch(/signed out on this device/);
    expect(error.outcome).toBe('failed');
  });
});

describe('profile auth-generation guard (handoff AUTH-003)', () => {
  it('discards user A after the browser has switched to user B', () => {
    expect(isCurrentAuthProfile(1, 2, 'user-a', 'user-b', 'user-a')).toBe(false);
  });

  it('commits only the current session user profile', () => {
    expect(isCurrentAuthProfile(2, 2, 'user-b', 'user-b', 'user-b')).toBe(true);
    expect(isCurrentAuthProfile(2, 2, 'user-b', 'user-b', 'user-a')).toBe(false);
    expect(isCurrentAuthProfile(2, 2, 'user-b', 'user-b', null)).toBe(true);
  });
});

describe('ProfileRequestTracker', () => {
  it('keeps a profile request in flight through a token refresh for the same user', () => {
    // Regression guard: bumping the generation on every auth event threw this
    // response away and left the profile empty until the next event.
    const tracker = new ProfileRequestTracker();
    tracker.applyEvent('INITIAL_SESSION', 'user-a');
    const request = tracker.begin();
    expect(tracker.applyEvent('TOKEN_REFRESHED', 'user-a')).toEqual({
      clearProfile: false,
      reloadProfile: false,
    });
    expect(tracker.canCommit(request, 'user-a', 'user-a')).toBe(true);
  });

  it("discards user A's response after user B signs in", () => {
    const tracker = new ProfileRequestTracker();
    tracker.applyEvent('INITIAL_SESSION', 'user-a');
    const requestForA = tracker.begin();
    tracker.applyEvent('SIGNED_IN', 'user-b');
    expect(tracker.canCommit(requestForA, 'user-a', 'user-a')).toBe(false);
  });

  it('lets only the newest request for the same user land', () => {
    const tracker = new ProfileRequestTracker();
    tracker.applyEvent('INITIAL_SESSION', 'user-a');
    const older = tracker.begin();
    const newer = tracker.begin();
    expect(tracker.canCommit(older, 'user-a', 'user-a')).toBe(false);
    expect(tracker.canCommit(newer, 'user-a', 'user-a')).toBe(true);
  });

  it('invalidates everything on sign-out', () => {
    const tracker = new ProfileRequestTracker();
    tracker.applyEvent('INITIAL_SESSION', 'user-a');
    const request = tracker.begin();
    tracker.signOut();
    expect(tracker.currentUserId).toBeNull();
    expect(tracker.canCommit(request, 'user-a', 'user-a')).toBe(false);
  });
});

describe('profileActionForAuthEvent', () => {
  it('never clears the signed-in user profile on routine events', () => {
    // The sequence a dashboard sees on load, tab refocus and token refresh.
    // Clearing the profile here is what bounced users to /login before.
    let previous: string | null = null;
    const actions = ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].map(
      (event) => {
        const action = profileActionForAuthEvent(event, previous, 'user-a');
        previous = 'user-a';
        return action;
      },
    );
    expect(actions.slice(1).every((action) => !action.clearProfile)).toBe(true);
    expect(actions[2]).toEqual({ clearProfile: false, reloadProfile: false });
  });

  it('clears and reloads when a different user signs in', () => {
    expect(profileActionForAuthEvent('SIGNED_IN', 'user-a', 'user-b')).toEqual({
      clearProfile: true,
      reloadProfile: true,
    });
  });

  it('clears without reloading on sign-out', () => {
    expect(profileActionForAuthEvent('SIGNED_OUT', 'user-a', null)).toEqual({
      clearProfile: true,
      reloadProfile: false,
    });
  });
});
