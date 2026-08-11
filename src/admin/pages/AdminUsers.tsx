import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Ban,
  BellRing,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MailPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../AdminAuthContext';
import {
  adminUserStatus,
  deleteAdminUser,
  inviteAdminUser,
  listAdminUsers,
  setAdminUserBlocked,
  type AdminUserPage,
  type AdminUserStatus,
  type AdminUserSummary,
} from '../adminUsers';

const PAGE_SIZE = 25;

export default function AdminUsers() {
  const { session } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserPage | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(searchParams.get('invite') === '1');
  const [pendingAction, setPendingAction] = useState<{
    user: AdminUserSummary;
    action: 'block' | 'unblock' | 'delete';
  } | null>(null);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminUsers(requestedPage, PAGE_SIZE);
      setData(result);
      setPage(requestedPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    if (searchParams.get('invite') === '1') setInviteOpen(true);
  }, [searchParams]);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en-US');
    if (!needle) return data?.users ?? [];
    return (data?.users ?? []).filter((user) =>
      [user.email, user.display_name, user.home_county]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('en-US').includes(needle)),
    );
  }, [data, query]);

  function closeInvite() {
    setInviteOpen(false);
    if (searchParams.has('invite')) {
      const next = new URLSearchParams(searchParams);
      next.delete('invite');
      setSearchParams(next, { replace: true });
    }
  }

  async function handleActionComplete(message: string) {
    setPendingAction(null);
    setNotice(message);
    await load(page);
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">People</p>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
            User administration
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            See who has an account, invite new users, and control access without opening the
            Supabase dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-dim"
        >
          <MailPlus className="h-4 w-4" /> Invite user
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-surface-container-highest bg-surface-container-lowest">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-container-highest p-4 lg:px-5">
          <div className="relative min-w-[min(100%,20rem)] flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this page by email, name, or county"
              className="w-full rounded-xl border border-surface-container-highest bg-surface px-9 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-on-surface-variant">
              {data ? `${data.total.toLocaleString()} total` : 'Loading users'}
            </span>
            <button
              type="button"
              onClick={() => void load(page)}
              disabled={loading}
              className="rounded-xl border border-surface-container-highest p-2.5 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface disabled:opacity-60"
              aria-label="Refresh users"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading users…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-low text-on-surface-variant">
              <Users className="h-6 w-6" />
            </span>
            <p className="font-semibold text-on-surface">No users found</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {query ? 'Try a different search on this page.' : 'Invite the first user to begin.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Activity</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-highest">
                  {filteredUsers.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      currentUserId={session?.user.id ?? null}
                      onAction={(action) => setPendingAction({ user, action })}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-surface-container-highest lg:hidden">
              {filteredUsers.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  currentUserId={session?.user.id ?? null}
                  onAction={(action) => setPendingAction({ user, action })}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-surface-container-highest px-4 py-3 lg:px-5">
          <p className="text-xs text-on-surface-variant">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load(page - 1)}
              disabled={loading || page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-container-highest px-3 py-1.5 text-sm font-semibold text-on-surface disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              type="button"
              onClick={() => void load(page + 1)}
              disabled={loading || page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-container-highest px-3 py-1.5 text-sm font-semibold text-on-surface disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-surface-container-highest bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Administrator accounts are visible but protected. Manage administrator access separately
          so a user-management mistake cannot lock the team out of the platform.
        </p>
      </div>

      {inviteOpen && (
        <InviteUserDialog
          onClose={closeInvite}
          onComplete={async (message) => {
            closeInvite();
            setNotice(message);
            await load(1);
          }}
        />
      )}
      {pendingAction && (
        <UserActionDialog
          user={pendingAction.user}
          action={pendingAction.action}
          onClose={() => setPendingAction(null)}
          onComplete={handleActionComplete}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  onAction,
}: {
  user: AdminUserSummary;
  currentUserId: string | null;
  onAction: (action: 'block' | 'unblock' | 'delete') => void;
}) {
  const status = adminUserStatus(user);
  return (
    <tr className="align-middle hover:bg-surface-container-low/60">
      <td className="px-5 py-4">
        <UserIdentity user={user} current={user.id === currentUserId} />
      </td>
      <td className="px-4 py-4"><StatusPill status={status} /></td>
      <td className="px-4 py-4"><UserActivity user={user} /></td>
      <td className="px-4 py-4 text-on-surface-variant">{formatDate(user.created_at)}</td>
      <td className="px-5 py-4"><UserActions user={user} status={status} onAction={onAction} /></td>
    </tr>
  );
}

function UserCard({
  user,
  currentUserId,
  onAction,
}: {
  user: AdminUserSummary;
  currentUserId: string | null;
  onAction: (action: 'block' | 'unblock' | 'delete') => void;
}) {
  const status = adminUserStatus(user);
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <UserIdentity user={user} current={user.id === currentUserId} />
        <StatusPill status={status} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <UserActivity user={user} />
        <UserActions user={user} status={status} onAction={onAction} />
      </div>
    </article>
  );
}

function UserIdentity({ user, current }: { user: AdminUserSummary; current: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="truncate font-semibold text-on-surface">{user.display_name || user.email}</p>
        {current && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            You
          </span>
        )}
      </div>
      {user.display_name && <p className="mt-0.5 truncate text-xs text-on-surface-variant">{user.email}</p>}
      <p className="mt-1 text-xs text-on-surface-variant">
        {user.last_sign_in_at ? `Last sign-in ${formatDate(user.last_sign_in_at)}` : 'Has not signed in'}
      </p>
    </div>
  );
}

function UserActivity({ user }: { user: AdminUserSummary }) {
  return (
    <div className="flex items-center gap-3 text-xs text-on-surface-variant">
      <span className="inline-flex items-center gap-1" title="Saved resources">
        <Bookmark className="h-3.5 w-3.5" /> {user.saved_resource_count}
      </span>
      <span className="inline-flex items-center gap-1" title="Waitlist alerts">
        <BellRing className="h-3.5 w-3.5" /> {user.waitlist_alert_count}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: AdminUserStatus }) {
  const config: Record<AdminUserStatus, { label: string; className: string; icon: typeof Ban }> = {
    administrator: { label: 'Administrator', className: 'bg-blue-50 text-blue-700', icon: ShieldCheck },
    blocked: { label: 'Blocked', className: 'bg-red-50 text-red-700', icon: Ban },
    invited: { label: 'Invited', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
    active: { label: 'Active', className: 'bg-green-50 text-green-700', icon: UserRoundCheck },
  };
  const item = config[status];
  const Icon = item.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${item.className}`}>
      <Icon className="h-3.5 w-3.5" /> {item.label}
    </span>
  );
}

function UserActions({
  user,
  status,
  onAction,
}: {
  user: AdminUserSummary;
  status: AdminUserStatus;
  onAction: (action: 'block' | 'unblock' | 'delete') => void;
}) {
  if (user.is_admin) {
    return <p className="text-right text-xs font-medium text-on-surface-variant">Protected</p>;
  }
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => onAction(status === 'blocked' ? 'unblock' : 'block')}
        className="rounded-lg border border-surface-container-highest px-2.5 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low"
      >
        {status === 'blocked' ? 'Unblock' : 'Block'}
      </button>
      <button
        type="button"
        onClick={() => onAction('delete')}
        className="rounded-lg border border-error/30 px-2.5 py-1.5 text-xs font-semibold text-error hover:bg-error/5"
      >
        Delete
      </button>
    </div>
  );
}

function InviteUserDialog({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (message: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await inviteAdminUser(email);
      await onComplete(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite this user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame title="Invite a user" onClose={onClose} disabled={busy}>
      <p className="mb-5 text-sm leading-relaxed text-on-surface-variant">
        The user will receive a secure invitation and choose their own password. Housing Navigator
        never sends or stores a password chosen by an administrator.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-on-surface">Email address</span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            className="mt-1.5 w-full rounded-xl border border-surface-container-highest px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        {error && <p className="rounded-xl bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-on-surface-variant">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function UserActionDialog({
  user,
  action,
  onClose,
  onComplete,
}: {
  user: AdminUserSummary;
  action: 'block' | 'unblock' | 'delete';
  onClose: () => void;
  onComplete: (message: string) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDelete = action === 'delete';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = isDelete
        ? await deleteAdminUser(user.id, confirmation)
        : await setAdminUserBlocked(user.id, action === 'block');
      await onComplete(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} this account`);
    } finally {
      setBusy(false);
    }
  }

  const title = isDelete
    ? 'Permanently delete account'
    : action === 'block'
      ? 'Block this account'
      : 'Unblock this account';
  return (
    <DialogFrame title={title} onClose={onClose} disabled={busy}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${isDelete ? 'bg-error/5 text-error' : 'bg-surface-container-low text-on-surface-variant'}`}>
          {isDelete ? (
            <>
              This permanently removes <strong>{user.email}</strong> and cascades deletion to their
              Housing Navigator profile, saved resources, and waitlist alerts. This cannot be undone.
            </>
          ) : action === 'block' ? (
            <>Blocked users cannot sign in. Their saved resources and alerts remain available if you unblock them later.</>
          ) : (
            <>This restores sign-in access and preserves all existing account data.</>
          )}
        </div>
        {isDelete && (
          <label className="block">
            <span className="text-sm font-semibold text-on-surface">
              Type <span className="font-mono text-xs">{user.email}</span> to confirm
            </span>
            <input
              type="email"
              required
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-surface-container-highest px-3 py-2.5 text-sm outline-none focus:border-error focus:ring-2 focus:ring-error/20"
            />
          </label>
        )}
        {error && <p className="rounded-xl bg-error/5 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-on-surface-variant">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (isDelete && confirmation.trim().toLocaleLowerCase('en-US') !== user.email.toLocaleLowerCase('en-US'))}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${isDelete ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {busy ? 'Working…' : isDelete ? <><Trash2 className="h-4 w-4" /> Delete permanently</> : title}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function DialogFrame({
  title,
  children,
  onClose,
  disabled,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  disabled: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-inverse-surface/50" onClick={onClose} disabled={disabled} aria-label="Close dialog" />
      <section role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="relative w-full max-w-lg rounded-3xl bg-surface-container-lowest p-5 shadow-2xl lg:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="user-dialog-title" className="font-headline text-xl font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} disabled={disabled} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp);
}
