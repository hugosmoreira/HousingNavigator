/**
 * Shared session-safety helpers for the public and admin auth contexts.
 *
 * Why this exists: `supabase.auth.signOut()` removes the browser's stored
 * session only after the remote /logout call succeeds. On a network or
 * server failure it returns `{ error }` and leaves `sb-<ref>-auth-token` in
 * localStorage, so the next person at a shared computer reloads into the
 * previous user's session. `signOutSafely` removes the local credential
 * first and treats the server-side revoke as a separate, best-effort step.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StorageLike {
  removeItem(key: string): void;
}

/** auth-js derives its storage key from the first label of the project URL. */
export function supabaseAuthStorageKey(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (!projectRef) throw new Error('Could not derive Supabase project ref');
  return `sb-${projectRef}-auth-token`;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Some privacy modes throw on access to localStorage itself.
    return null;
  }
}

/** Remove every key auth-js persists for this project (session, PKCE verifier, user). */
export function clearPersistedSupabaseSession(
  supabaseUrl: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const key = supabaseAuthStorageKey(supabaseUrl);
  for (const item of [key, `${key}-code-verifier`, `${key}-user`]) {
    try {
      storage.removeItem(item);
    } catch {
      // Keep going: one failing key must not leave the others behind.
    }
  }
}

/**
 * True when a profile response still belongs to the signed-in user: no auth
 * event happened since the request started, the session user is the one we
 * asked about, and the row returned is that user's.
 */
export function isCurrentAuthProfile(
  requestGeneration: number,
  currentGeneration: number,
  requestedUserId: string,
  currentUserId: string | null,
  returnedProfileId: string | null,
): boolean {
  return (
    requestGeneration === currentGeneration &&
    requestedUserId === currentUserId &&
    (returnedProfileId === null || returnedProfileId === requestedUserId)
  );
}

export interface ProfileEventAction {
  /** Drop the loaded profile now (no user, or a different user). */
  clearProfile: boolean;
  /** Fetch the profile for the session's user. */
  reloadProfile: boolean;
}

/**
 * What an auth event means for the loaded public profile. The same user's
 * profile is never cleared by routine events (tab refocus SIGNED_IN, token
 * refresh), because `isAuthed` comes from the session and the profile is
 * optional data; a different user's profile is cleared at once.
 */
export function profileActionForAuthEvent(
  event: string,
  previousUserId: string | null,
  nextUserId: string | null,
): ProfileEventAction {
  if (!nextUserId) return { clearProfile: true, reloadProfile: false };
  if (nextUserId !== previousUserId) return { clearProfile: true, reloadProfile: true };
  if (event === 'TOKEN_REFRESHED') return { clearProfile: false, reloadProfile: false };
  return { clearProfile: false, reloadProfile: true };
}

/**
 * Decides which profile responses may be committed (handoff AUTH-003).
 * The generation advances when a request starts and when the user changes,
 * so only the newest request for the signed-in user can land. Same-user
 * events such as a token refresh do not advance it, so a request already in
 * flight is not discarded.
 */
export class ProfileRequestTracker {
  private generation = 0;
  private userId: string | null = null;

  get currentUserId(): string | null {
    return this.userId;
  }

  /** Apply an auth event and return what it means for the loaded profile. */
  applyEvent(event: string, nextUserId: string | null): ProfileEventAction {
    const action = profileActionForAuthEvent(event, this.userId, nextUserId);
    if (nextUserId !== this.userId) this.generation += 1;
    this.userId = nextUserId;
    return action;
  }

  /** Start a profile request; pass the returned value to `canCommit`. */
  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  canCommit(generation: number, requestedUserId: string, returnedProfileId: string | null): boolean {
    return isCurrentAuthProfile(
      generation,
      this.generation,
      requestedUserId,
      this.userId,
      returnedProfileId,
    );
  }

  /** Forget the user and invalidate every request in flight. */
  signOut(): void {
    this.generation += 1;
    this.userId = null;
  }
}

/** How the server-side revoke of the user's refresh tokens ended. */
export type RemoteRevokeOutcome =
  /** Every refresh token for the user was revoked. */
  | 'revoked'
  /** The server says the session or user no longer exists (403/404). */
  | 'already-ended'
  /** There was no access token to revoke with. */
  | 'skipped'
  /** The access token was rejected (401), so other devices were not signed out. */
  | 'token-rejected'
  /** Network or server failure; other devices were not signed out. */
  | 'failed';

export interface SafeSignOutResult {
  remote: RemoteRevokeOutcome;
  error?: unknown;
}

/** Thrown by the auth contexts when this device is signed out but the server revoke did not happen. */
export class RemoteSignOutError extends Error {
  readonly outcome: RemoteRevokeOutcome;

  constructor(outcome: RemoteRevokeOutcome, cause?: unknown) {
    super(
      "You're signed out on this device, but we couldn't end your sessions on other devices.",
    );
    this.name = 'RemoteSignOutError';
    this.outcome = outcome;
    (this as { cause?: unknown }).cause = cause;
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Sign this browser out first, then revoke the user's refresh tokens on the
 * server. The local part never depends on the network:
 *
 * 1. Delete the stored session, so a reload cannot restore it.
 * 2. `signOut({ scope: 'local' })`: with storage empty the SDK makes no
 *    network call, clears its own state and emits SIGNED_OUT.
 * 3. Delete the stored session again, in case a token refresh that was
 *    already running wrote it back between steps 1 and 2.
 * 4. Revoke every refresh token for the user (`scope: 'global'`) with the
 *    access token captured before sign-out. This step only reports.
 */
export async function signOutSafely(
  client: SupabaseClient,
  supabaseUrl: string,
  options: { accessToken?: string | null; storage?: StorageLike | null; timeoutMs?: number } = {},
): Promise<SafeSignOutResult> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  clearPersistedSupabaseSession(supabaseUrl, storage);
  try {
    await withTimeout(client.auth.signOut({ scope: 'local' }), timeoutMs, 'local signOut');
  } catch {
    // The stored session is removed below regardless.
  } finally {
    clearPersistedSupabaseSession(supabaseUrl, storage);
  }

  if (!options.accessToken) return { remote: 'skipped' };
  try {
    const { error } = await withTimeout(
      client.auth.admin.signOut(options.accessToken, 'global'),
      timeoutMs,
      'remote signOut',
    );
    if (!error) return { remote: 'revoked' };
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404) return { remote: 'already-ended', error };
    if (status === 401) return { remote: 'token-rejected', error };
    return { remote: 'failed', error };
  } catch (error) {
    return { remote: 'failed', error };
  }
}

/** True when the device is signed out but other devices may still hold a valid session. */
export function remoteRevokeIncomplete(result: SafeSignOutResult): boolean {
  return result.remote === 'failed' || result.remote === 'token-rejected';
}
