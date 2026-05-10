import { useState } from 'react';
import { Mail, MessageSquare, Settings } from 'lucide-react';
import { usePublicAuth } from '../../auth/PublicAuthContext';
import { updateProfile } from '../../services/userData';

/**
 * Email-notifications toggle persists to `profiles.email_notifications_enabled`.
 * SMS row is intentionally disabled — placeholder for the next phase.
 *
 * TODO(notifications): the email toggle here only stores the preference.
 * Actual delivery will be wired through a Supabase Edge Function calling
 * Resend (see notification_events table in migration 0004).
 */
export default function NotificationSettingsPanel() {
  const { profile, session, refreshProfile } = usePublicAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = profile?.email_notifications_enabled ?? false;

  async function handleEmailToggle(next: boolean) {
    if (!session || !profile) return;
    setError(null);
    setPending(true);
    try {
      await updateProfile(session.user.id, { email_notifications_enabled: next });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update preference');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bg-surface-container-low rounded-3xl p-8 lg:p-10">
      <div className="flex items-start gap-4 mb-6">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-secondary-container/50 text-tertiary-dim flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-lg font-headline font-bold text-on-surface tracking-tight">
            Notification settings
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed mt-1">
            Email is the only channel today. SMS is on the roadmap.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <ChannelRow
          icon={<Mail className="w-4 h-4" />}
          title="Email notifications"
          subtitle={profile?.email ?? '—'}
          checked={enabled}
          disabled={pending || !profile}
          onChange={handleEmailToggle}
        />
        <ChannelRow
          icon={<MessageSquare className="w-4 h-4" />}
          title="SMS notifications"
          subtitle="Coming soon"
          checked={false}
          disabled
          onChange={() => {}}
        />
      </div>
    </section>
  );
}

function ChannelRow({
  icon,
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface-container-lowest border border-surface-container-highest rounded-xl px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-on-surface">{title}</div>
          <div className="text-xs text-on-surface-variant truncate">{subtitle}</div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-surface-container-highest'
        }`}
      >
        <span
          className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
