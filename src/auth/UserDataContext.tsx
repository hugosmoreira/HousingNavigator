/**
 * Cached visitor-owned data: saved resources + waitlist alerts.
 *
 * Both are loaded once when the visitor signs in (or arrives with an
 * existing session) and then mutated optimistically. The provider lives
 * inside `<PublicAuthProvider>` so it can react to session changes, and
 * inside `<AuthPromptProvider>` so toggle helpers can ask logged-out
 * visitors to sign in instead of failing silently.
 *
 * Resource IDs in `saved_resources.resource_id` are uuids referencing
 * `public.resources(id)`. When the public catalog is read from the
 * bundled JSON (`VITE_USE_SUPABASE` not set) the program ids are not
 * uuids, so attempting to save them would FK-fail. The toggle helper
 * surfaces a clear error in that case rather than letting Supabase
 * raise a cryptic foreign-key violation.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  followWaitlist,
  listSavedResources,
  listWaitlistAlerts,
  saveResource,
  unfollowWaitlist,
  unsaveResource,
  updateWaitlistAlertPrefs,
  type WaitlistAlertRow,
} from '../services/userData';
import { usePublicAuth } from './PublicAuthContext';
import { useAuthPrompt } from './AuthPromptContext';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UserDataValue {
  loading: boolean;

  // saved resources
  savedResourceIds: ReadonlySet<string>;
  isResourceSaved(id: string): boolean;
  toggleResource(id: string): Promise<void>;

  // waitlist alerts
  alertsByWaitlistId: ReadonlyMap<string, WaitlistAlertRow>;
  isWaitlistFollowed(id: string): boolean;
  toggleWaitlistAlert(id: string): Promise<void>;
  setAlertPrefs(
    id: string,
    prefs: { notify_on_open?: boolean; notify_on_status_change?: boolean },
  ): Promise<void>;

  /** Force a refetch — handy after dashboard mutations. */
  refresh(): Promise<void>;
}

const UserDataContext = createContext<UserDataValue | null>(null);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { session, isAuthed } = usePublicAuth();
  const { promptToSignIn } = useAuthPrompt();

  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [alerts, setAlerts] = useState<Map<string, WaitlistAlertRow>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session || !isAuthed) {
      setSavedIds(new Set());
      setAlerts(new Map());
      return;
    }
    setLoading(true);
    try {
      const [saved, alertRows] = await Promise.all([
        listSavedResources(),
        listWaitlistAlerts(),
      ]);
      setSavedIds(new Set(saved.map((row) => row.resource_id)));
      setAlerts(new Map(alertRows.map((row) => [row.waitlist_id, row])));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[user-data] initial load failed', err);
    } finally {
      setLoading(false);
    }
  }, [session, isAuthed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ----- resources ---------------------------------------------------------

  const isResourceSaved = useCallback(
    (id: string) => savedIds.has(id),
    [savedIds],
  );

  const toggleResource = useCallback(
    async (id: string) => {
      if (!session || !isAuthed) {
        promptToSignIn('Sign in or create an account to save resources to your dashboard.');
        return;
      }
      if (!UUID_RE.test(id)) {
        throw new Error(
          'This resource cannot be saved yet. The site is reading from the bundled catalog; switch to Supabase mode (VITE_USE_SUPABASE=true) and seed the database from the admin to enable saving.',
        );
      }
      const wasSaved = savedIds.has(id);
      // Optimistic update — flip immediately, roll back on error.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        if (wasSaved) {
          await unsaveResource(id);
        } else {
          await saveResource(session.user.id, id);
        }
      } catch (err) {
        // Rollback.
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(id);
          else next.delete(id);
          return next;
        });
        throw err;
      }
    },
    [session, isAuthed, savedIds, promptToSignIn],
  );

  // ----- waitlist alerts ---------------------------------------------------

  const isWaitlistFollowed = useCallback(
    (id: string) => alerts.has(id),
    [alerts],
  );

  const toggleWaitlistAlert = useCallback(
    async (id: string) => {
      if (!session || !isAuthed) {
        promptToSignIn('Sign in or create an account to get notified when this waitlist changes.');
        return;
      }
      const existing = alerts.get(id);
      if (existing) {
        // Optimistic remove.
        setAlerts((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        try {
          await unfollowWaitlist(id);
        } catch (err) {
          setAlerts((prev) => new Map(prev).set(id, existing));
          throw err;
        }
        return;
      }
      // Optimistic placeholder — real row replaces it after insert returns.
      const placeholder: WaitlistAlertRow = {
        id: `pending-${id}`,
        waitlist_id: id,
        notify_on_open: true,
        notify_on_status_change: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setAlerts((prev) => new Map(prev).set(id, placeholder));
      try {
        const row = await followWaitlist(session.user.id, id);
        setAlerts((prev) => new Map(prev).set(id, row));
      } catch (err) {
        setAlerts((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        throw err;
      }
    },
    [session, isAuthed, alerts, promptToSignIn],
  );

  const setAlertPrefs = useCallback<UserDataValue['setAlertPrefs']>(
    async (id, prefs) => {
      if (!session || !isAuthed) {
        promptToSignIn('Sign in to change your notification preferences.');
        return;
      }
      const existing = alerts.get(id);
      if (!existing) throw new Error('Not following this waitlist.');
      const optimistic: WaitlistAlertRow = { ...existing, ...prefs };
      setAlerts((prev) => new Map(prev).set(id, optimistic));
      try {
        await updateWaitlistAlertPrefs(id, prefs);
      } catch (err) {
        setAlerts((prev) => new Map(prev).set(id, existing));
        throw err;
      }
    },
    [session, isAuthed, alerts, promptToSignIn],
  );

  const value = useMemo<UserDataValue>(
    () => ({
      loading,
      savedResourceIds: savedIds,
      isResourceSaved,
      toggleResource,
      alertsByWaitlistId: alerts,
      isWaitlistFollowed,
      toggleWaitlistAlert,
      setAlertPrefs,
      refresh,
    }),
    [
      loading,
      savedIds,
      isResourceSaved,
      toggleResource,
      alerts,
      isWaitlistFollowed,
      toggleWaitlistAlert,
      setAlertPrefs,
      refresh,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    throw new Error('useUserData must be used inside <UserDataProvider>');
  }
  return ctx;
}
