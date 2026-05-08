import { useState } from 'react';
import { useWaitlists } from '../hooks/useWaitlists';
import type { WaitlistStatus } from '../types';

interface StatusPresentation {
  label: string;
  className: string;
  icon: string;
}

const STATUS_PRESENTATION: Record<WaitlistStatus, StatusPresentation> = {
  open: { label: 'OPEN', className: 'bg-blue-100 text-primary', icon: 'check_circle' },
  closed: {
    label: 'CLOSED',
    className: 'bg-surface-container-highest text-on-surface-variant',
    icon: 'lock',
  },
  unknown: { label: 'UNKNOWN', className: 'bg-purple-100 text-purple-700', icon: 'help' },
};

function formatLastChecked(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Waitlist() {
  const { waitlists, loading, error } = useWaitlists();
  const [notifying, setNotifying] = useState<Record<string, boolean>>({});

  function toggleNotify(id: string) {
    setNotifying((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="bg-surface-container-low min-h-[calc(100vh-80px)] py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">Housing Waitlist Tracker</h1>
          <p className="text-on-surface-variant text-base leading-relaxed">
            Stay informed about local housing opportunities. Monitor open waitlists across different authorities and set up alerts so you never miss an application window.
          </p>
        </div>

        {error && (
          <div className="bg-surface-container-lowest border border-error/30 rounded-2xl p-6 mb-8">
            <p className="text-error font-medium">Couldn't load waitlists right now.</p>
            <p className="text-on-surface-variant text-sm mt-1">{error.message}</p>
          </div>
        )}

        {loading && !error && (
          <p className="text-on-surface-variant text-sm mb-6">Loading waitlists…</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {waitlists.map((wl) => {
            const presentation = STATUS_PRESENTATION[wl.status];
            const isNotifying = notifying[wl.id] ?? false;
            return (
              <div
                key={wl.id}
                className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest flex flex-col hover:border-outline-variant/30 transition-colors"
              >
                <div className="flex justify-between items-start mb-6 gap-4">
                  <h3 className="text-lg font-headline font-bold text-on-surface leading-tight">
                    {wl.agency}
                  </h3>
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold shrink-0 ${presentation.className}`}
                  >
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {presentation.icon}
                    </span>
                    {presentation.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-surface-container-low text-on-surface-variant text-sm px-3 py-2 rounded-lg font-medium w-fit mb-4">
                  <span className="material-symbols-outlined text-[16px]">history</span>
                  Last checked: {formatLastChecked(wl.last_checked)}
                </div>

                {wl.notes && (
                  <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">{wl.notes}</p>
                )}

                <div className="flex justify-between items-center mt-auto pt-4 border-t border-surface-container-highest/60">
                  <a
                    href={wl.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary font-semibold text-sm hover:text-primary-dim flex items-center gap-1 transition-colors"
                  >
                    Learn more <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </a>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-on-surface-variant">Notify me</span>
                    <button
                      type="button"
                      aria-pressed={isNotifying}
                      onClick={() => toggleNotify(wl.id)}
                      className={`w-11 h-6 rounded-full relative transition-colors ${
                        isNotifying ? 'bg-primary' : 'bg-surface-container-highest'
                      }`}
                    >
                      <div
                        className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                          isNotifying ? 'translate-x-5' : ''
                        }`}
                      ></div>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
