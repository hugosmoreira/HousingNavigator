import { usePublicAuth } from '../auth/PublicAuthContext';
import SavedResourcesPanel from './dashboard/SavedResourcesPanel';
import WaitlistAlertsPanel from './dashboard/WaitlistAlertsPanel';
import NotificationSettingsPanel from './dashboard/NotificationSettingsPanel';

export default function Dashboard() {
  const { profile } = usePublicAuth();
  const greeting = profile?.display_name?.trim() || profile?.email || 'there';

  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-5xl mx-auto px-6 lg:px-12">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Your dashboard
          </p>
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">
            Welcome, {greeting}
          </h1>
          <p className="text-on-surface-variant text-base leading-relaxed max-w-2xl">
            Track waitlists you care about, save resources for later, and
            choose how you want to be notified.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <WaitlistAlertsPanel />
          <SavedResourcesPanel />
        </div>

        <div className="mt-6">
          <NotificationSettingsPanel />
        </div>
      </div>
    </div>
  );
}
