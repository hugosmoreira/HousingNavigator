import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import {
  listNotificationEvents,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationEventRow,
} from '../../services/userData';

/**
 * In-app alert history. Every email the alert pipeline sends also writes a
 * `notification_events` row, so users can see status changes here even when
 * the email lands in spam or notifications are turned off.
 */
export default function NotificationsPanel() {
  const [events, setEvents] = useState<NotificationEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAll, setPendingAll] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await listNotificationEvents();
        if (active) setEvents(rows);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load alerts');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const unreadCount = events.filter((e) => !e.read).length;

  async function handleMarkRead(id: string) {
    const target = events.find((e) => e.id === id);
    if (!target || target.read) return;
    // Optimistic: flip locally, roll back if the update fails.
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)));
    try {
      await markNotificationRead(id);
    } catch {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read: false } : e)));
    }
  }

  async function handleMarkAll() {
    if (unreadCount === 0) return;
    setPendingAll(true);
    setError(null);
    const snapshot = events;
    setEvents((prev) => prev.map((e) => ({ ...e, read: true })));
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setEvents(snapshot);
      setError(err instanceof Error ? err.message : 'Could not update alerts');
    } finally {
      setPendingAll(false);
    }
  }

  return (
    <section className="bg-surface-container-low rounded-3xl p-8 lg:p-10">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-start gap-4">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-secondary-container/50 text-tertiary-dim flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-headline font-bold text-on-surface tracking-tight flex items-center gap-2">
              Alerts
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold">
                  {unreadCount}
                </span>
              )}
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed mt-1">
              A copy of every alert email we send you, in case one gets lost.
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={pendingAll}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim disabled:opacity-60"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          No alerts yet. Follow a waitlist and you will see its status changes
          here as soon as they are confirmed.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
                e.read
                  ? 'bg-surface-container-lowest border-surface-container-highest'
                  : 'bg-primary/5 border-primary/20'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {!e.read && (
                    <span
                      className="w-1.5 h-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                  <div className="text-sm font-semibold text-on-surface truncate">
                    {e.title}
                  </div>
                </div>
                {e.body && (
                  <div className="text-sm text-on-surface-variant mt-0.5">{e.body}</div>
                )}
                <div className="text-xs text-on-surface-variant mt-1">
                  {new Date(e.created_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              {!e.read && (
                <button
                  type="button"
                  onClick={() => handleMarkRead(e.id)}
                  aria-label={`Mark "${e.title}" as read`}
                  className="shrink-0 text-xs font-semibold text-primary hover:text-primary-dim"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
