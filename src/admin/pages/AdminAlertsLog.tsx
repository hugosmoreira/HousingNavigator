import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';

/**
 * Read-only log of waitlist alert batches that actually went out.
 *
 * Backed by the `alert_send_log_admin` view (migration 0011), which
 * aggregates `notification_events` into one row per batch and returns zero
 * rows for non-admins. There is nothing to click here on purpose — sends
 * are fired by the DB trigger; this page exists so an admin can answer
 * "did the alert go out, when, and to how many people" without SQL.
 */

interface AlertSendLogRow {
  waitlist_id: string;
  waitlist_name: string;
  previous_status: string | null;
  new_status: string | null;
  recipient_count: number;
  sent_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  limited: 'Limited',
  closed: 'Closed',
  unknown: 'Unknown',
};

function statusLabel(value: string | null): string {
  if (!value) return '—';
  return STATUS_LABEL[value] ?? value;
}

export default function AdminAlertsLog() {
  const [rows, setRows] = useState<AlertSendLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = await requireSupabase();
        const { data, error: err } = await client
          .from('alert_send_log_admin')
          .select('*')
          .order('sent_at', { ascending: false })
          .limit(200);
        if (err) throw err;
        if (active) setRows((data ?? []) as AlertSendLogRow[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-headline font-bold tracking-tight">Alerts sent</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Every alert email batch delivered to waitlist followers. Batches fire
          automatically when a waitlist status opens up and are de-duplicated per
          waitlist and status within 24 hours.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-surface-container-highest">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-4 py-3 font-semibold">Sent</th>
              <th className="px-4 py-3 font-semibold">Waitlist</th>
              <th className="px-4 py-3 font-semibold">Status change</th>
              <th className="px-4 py-3 font-semibold text-right">Recipients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-highest bg-surface-container-lowest">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  <div className="flex flex-col items-center gap-2">
                    <BellRing className="w-5 h-5" aria-hidden="true" />
                    <span>No alert emails have been sent yet.</span>
                    <span className="text-xs max-w-md">
                      When a followed waitlist changes to Open or Limited, followers are
                      emailed automatically and the batch shows up here.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.waitlist_id}-${row.new_status}-${row.sent_at}`}>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                    {new Date(row.sent_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-on-surface">{row.waitlist_name}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                    {statusLabel(row.previous_status)} → {statusLabel(row.new_status)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-on-surface">
                    {row.recipient_count}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
