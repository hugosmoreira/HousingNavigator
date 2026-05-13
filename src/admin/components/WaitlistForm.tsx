import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import type { WaitlistRow } from '../../services/data/dbTypes';
import type { County, WaitlistStatus } from '../../types';
import { Field, Select, TextArea, TextInput, Toggle } from './FormField';
import {
  isDryRun,
  isMeaningfulUpgrade,
  isSkipped,
  notifyWaitlistAlert,
} from '../notifyWaitlistAlert';
import NotifySubscribersModal from './NotifySubscribersModal';

const COUNTIES: County[] = ['Multnomah', 'Clark', 'Washington', 'Clackamas', 'Other'];
const STATUSES: Array<{ value: WaitlistStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'limited', label: 'Limited' },
  { value: 'closed', label: 'Closed' },
  { value: 'unknown', label: 'Unknown' },
];

type WaitlistDraft = Omit<WaitlistRow, 'id'> & { notes?: string | null };

const EMPTY: WaitlistDraft = {
  housing_authority: '',
  program_name: '',
  county: 'Multnomah',
  city: '',
  state: '',
  status: 'unknown',
  application_link: '',
  source_url: '',
  last_checked: null,
  notes: null,
  public_notes: '',
  internal_notes: '',
  published: false,
};

export interface WaitlistFormProps {
  mode: 'new' | 'edit';
  waitlistId?: string;
}

interface NotifyPrompt {
  previous: WaitlistStatus;
  next: WaitlistStatus;
  count: number;
}

export default function WaitlistForm({ mode, waitlistId }: WaitlistFormProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<WaitlistDraft>(EMPTY);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the loaded status so we can detect a meaningful upgrade
  // on save. Null in `new` mode and before the initial load completes.
  const [originalStatus, setOriginalStatus] = useState<WaitlistStatus | null>(null);
  const [notifyPrompt, setNotifyPrompt] = useState<NotifyPrompt | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyToast, setNotifyToast] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !waitlistId) return;
    let active = true;
    (async () => {
      try {
        const client = requireSupabase();
        const { data, error: err } = await client
          .from('waitlists')
          .select('*')
          .eq('id', waitlistId)
          .maybeSingle();
        if (err) throw err;
        if (!data) throw new Error('Waitlist not found');
        if (!active) return;
        const row = data as WaitlistRow;
        setOriginalStatus(row.status);
        setDraft({
          housing_authority: row.housing_authority,
          program_name: row.program_name ?? '',
          county: row.county,
          city: row.city ?? '',
          state: row.state ?? '',
          status: row.status,
          application_link: row.application_link ?? '',
          source_url: row.source_url ?? '',
          last_checked: row.last_checked ?? null,
          notes: row.notes,
          public_notes: row.public_notes ?? row.notes ?? '',
          internal_notes: row.internal_notes ?? '',
          published: row.published,
        });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, waitlistId]);

  function update<K extends keyof WaitlistDraft>(key: K, value: WaitlistDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotifyToast(null);
    setSaving(true);
    try {
      const client = requireSupabase();
      const payload = sanitize(draft);
      if (mode === 'new') {
        const insertPayload = { ...payload, id: slugify(payload.housing_authority, payload.program_name) };
        const { data, error: err } = await client
          .from('waitlists')
          .insert(insertPayload)
          .select('id')
          .single();
        if (err) throw err;
        // New waitlists have no prior status, so the notification flow
        // never applies on create. Just navigate to the edit screen.
        navigate(`/admin/waitlists/${(data as { id: string }).id}/edit`, { replace: true });
        return;
      }
      if (!waitlistId) return;

      // 1. Commit the DB update FIRST. The notification side is a
      //    best-effort follow-up; it must never block the save.
      const { error: err } = await client
        .from('waitlists')
        .update(payload)
        .eq('id', waitlistId);
      if (err) throw err;

      // 2. If the status moved into a "more open" state, ask the Edge
      //    Function how many subscribers would be notified, then show
      //    the confirmation modal. Any failure here (function not
      //    deployed, network, etc.) is non-blocking — we just navigate
      //    away as before.
      if (originalStatus && isMeaningfulUpgrade(originalStatus, draft.status)) {
        try {
          const preview = await notifyWaitlistAlert({
            waitlist_id: waitlistId,
            previous_status: originalStatus,
            new_status: draft.status,
            dry_run: true,
          });
          if (isDryRun(preview) && preview.subscriber_count > 0) {
            setNotifyPrompt({
              previous: originalStatus,
              next: draft.status,
              count: preview.subscriber_count,
            });
            return;
          }
        } catch (notifyErr) {
          // eslint-disable-next-line no-console
          console.warn('[waitlist] notification preview failed', notifyErr);
        }
      }

      navigate('/admin/waitlists');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmNotify() {
    if (!notifyPrompt || !waitlistId) return;
    setNotifying(true);
    try {
      const result = await notifyWaitlistAlert({
        waitlist_id: waitlistId,
        previous_status: notifyPrompt.previous,
        new_status: notifyPrompt.next,
      });
      setNotifyPrompt(null);
      if (isSkipped(result)) {
        // Informational — dedupe / nothing to do. Navigate and let the
        // admin keep moving.
        navigate('/admin/waitlists');
        return;
      }
      if ('sent_count' in result) {
        const reason = 'reason' in result ? result.reason : null;
        const failed = result.failed_count ?? 0;
        if (reason || failed > 0) {
          // Surface partial / configuration failures on the form so the
          // admin can act (configure Resend, retry, etc.). Do not
          // navigate.
          setNotifyToast(
            reason
              ? `Email could not be sent (${reason}). The status change is saved.`
              : `Sent ${result.sent_count} of ${result.subscriber_count}, ${failed} failed. The status change is saved.`,
          );
          return;
        }
        // Clean success — navigate away.
        navigate('/admin/waitlists');
      }
    } catch (err) {
      // Function error (not admin, transition rejected, function not
      // deployed). Keep the admin on this page to read the message; the
      // DB change is already saved.
      setNotifyPrompt(null);
      setNotifyToast(
        err instanceof Error ? `Could not send: ${err.message}` : 'Could not send notifications.',
      );
    } finally {
      setNotifying(false);
    }
  }

  function handleCancelNotify() {
    setNotifyPrompt(null);
    navigate('/admin/waitlists');
  }

  async function handleDelete() {
    if (!waitlistId) return;
    if (!window.confirm('Delete this waitlist? This cannot be undone.')) return;
    setSaving(true);
    try {
      const client = requireSupabase();
      const { error: err } = await client.from('waitlists').delete().eq('id', waitlistId);
      if (err) throw err;
      navigate('/admin/waitlists');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-on-surface-variant">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-10">
      <Link
        to="/admin/waitlists"
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to waitlists
      </Link>

      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-2xl font-headline font-bold tracking-tight">
          {mode === 'new' ? 'New waitlist' : 'Edit waitlist'}
        </h1>
        <Toggle
          label={draft.published ? 'Published' : 'Draft'}
          hint={
            draft.published
              ? 'Visible on the public Waitlists page.'
              : 'Hidden from the public site until you publish.'
          }
          checked={draft.published}
          onChange={(value) => update('published', value)}
        />
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {notifyToast && (
        <div
          role="status"
          className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex items-start justify-between gap-3"
        >
          <span>{notifyToast}</span>
          <button
            type="button"
            onClick={() => setNotifyToast(null)}
            className="text-xs font-semibold uppercase tracking-wide text-yellow-900/70 hover:text-yellow-900"
          >
            Dismiss
          </button>
        </div>
      )}

      <NotifySubscribersModal
        open={notifyPrompt !== null}
        previousStatus={notifyPrompt?.previous ?? 'unknown'}
        newStatus={notifyPrompt?.next ?? 'unknown'}
        subscriberCount={notifyPrompt?.count ?? 0}
        sending={notifying}
        onConfirm={handleConfirmNotify}
        onCancel={handleCancelNotify}
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        <Section title="Identity">
          <Field label="Housing authority" required>
            <TextInput
              value={draft.housing_authority}
              onChange={(e) => update('housing_authority', e.target.value)}
              required
            />
          </Field>
          <Field label="Program name" hint="Optional sub-program (e.g. HCV, project-based).">
            <TextInput
              value={draft.program_name ?? ''}
              onChange={(e) => update('program_name', e.target.value)}
            />
          </Field>
        </Section>

        <Section title="Location">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="County" required>
              <Select
                value={draft.county}
                onChange={(e) => update('county', e.target.value as County)}
              >
                {COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="City">
              <TextInput
                value={draft.city ?? ''}
                onChange={(e) => update('city', e.target.value)}
              />
            </Field>
            <Field label="State">
              <TextInput
                value={draft.state ?? ''}
                maxLength={2}
                onChange={(e) => update('state', e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </Section>

        <Section title="Status & links">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Current status" required>
              <Select
                value={draft.status}
                onChange={(e) => update('status', e.target.value as WaitlistStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Last checked">
              <TextInput
                type="date"
                value={draft.last_checked ?? ''}
                onChange={(e) => update('last_checked', e.target.value || null)}
              />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Application link" hint="Where applicants apply or check status.">
              <TextInput
                type="url"
                value={draft.application_link ?? ''}
                onChange={(e) => update('application_link', e.target.value)}
              />
            </Field>
            <Field label="Source URL" hint="Where you confirmed this status.">
              <TextInput
                type="url"
                value={draft.source_url ?? ''}
                onChange={(e) => update('source_url', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Notes">
          <Field label="Public notes" hint="Visible on the public Waitlists page.">
            <TextArea
              value={draft.public_notes ?? ''}
              onChange={(e) => update('public_notes', e.target.value)}
            />
          </Field>
          <Field label="Internal notes" hint="Admin-only; never shown publicly.">
            <TextArea
              value={draft.internal_notes ?? ''}
              onChange={(e) => update('internal_notes', e.target.value)}
            />
          </Field>
        </Section>

        <div className="flex items-center justify-between gap-4 flex-wrap pt-4 border-t border-surface-container-highest">
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="text-sm font-semibold text-error hover:underline disabled:opacity-60"
            >
              Delete waitlist
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <Link
              to="/admin/waitlists"
              className="text-sm font-semibold text-on-surface-variant hover:text-on-surface px-4 py-2"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : mode === 'new' ? 'Create waitlist' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function sanitize(draft: WaitlistDraft): WaitlistDraft {
  return {
    ...draft,
    housing_authority: draft.housing_authority.trim(),
    program_name: emptyToNull(draft.program_name),
    city: emptyToNull(draft.city),
    state: emptyToNull(draft.state),
    application_link: emptyToNull(draft.application_link),
    source_url: emptyToNull(draft.source_url),
    public_notes: emptyToNull(draft.public_notes),
    internal_notes: emptyToNull(draft.internal_notes),
    notes: emptyToNull(draft.public_notes),
    last_checked: draft.last_checked || null,
  };
}

function slugify(authority: string, program: string | null): string {
  const base = [authority, program].filter(Boolean).join(' ').toLowerCase();
  const slug = base
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 6);
  return slug ? `${slug}-${suffix}` : `waitlist-${suffix}`;
}
