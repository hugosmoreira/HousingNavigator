import { Bell } from 'lucide-react';

export default function Waitlist() {
  const waitlists = [
    {
      id: 1,
      agency: 'Home Forward (Multnomah)',
      status: 'OPEN',
      statusColor: 'bg-blue-100 text-primary',
      statusIcon: 'check_circle',
      lastChecked: 'Today, 9:00 AM',
      notifying: true
    },
    {
      id: 2,
      agency: 'Vancouver Housing Authority (Clark)',
      status: 'CLOSED',
      statusColor: 'bg-surface-container-highest text-on-surface-variant',
      statusIcon: 'lock',
      lastChecked: 'Yesterday',
      notifying: false
    },
    {
      id: 3,
      agency: 'Clackamas County Housing Authority',
      status: 'UNKNOWN',
      statusColor: 'bg-purple-100 text-purple-700',
      statusIcon: 'help',
      lastChecked: 'Oct 24, 2023',
      notifying: true
    },
    {
      id: 4,
      agency: 'Washington County Dept. of Housing',
      status: 'CLOSED',
      statusColor: 'bg-surface-container-highest text-on-surface-variant',
      statusIcon: 'lock',
      lastChecked: 'Today, 8:45 AM',
      notifying: false
    }
  ];

  return (
    <div className="bg-surface-container-low min-h-[calc(100vh-80px)] py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">Housing Waitlist Tracker</h1>
          <p className="text-on-surface-variant text-base leading-relaxed">
            Stay informed about local housing opportunities. Monitor open waitlists across different authorities and set up alerts so you never miss an application window.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {waitlists.map((wl) => (
            <div key={wl.id} className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest flex flex-col hover:border-outline-variant/30 transition-colors">
              <div className="flex justify-between items-start mb-6 gap-4">
                <h3 className="text-lg font-headline font-bold text-on-surface leading-tight">{wl.agency}</h3>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold shrink-0 ${wl.statusColor}`}>
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{wl.statusIcon}</span>
                  {wl.status}
                </span>
              </div>
              
              <div className="flex items-center gap-2 bg-surface-container-low text-on-surface-variant text-sm px-3 py-2 rounded-lg font-medium w-fit mb-8">
                <span className="material-symbols-outlined text-[16px]">history</span>
                Last checked: {wl.lastChecked}
              </div>
              
              <div className="flex justify-between items-center mt-auto pt-4 border-t border-surface-container-highest/60">
                <button className="text-primary font-semibold text-sm hover:text-primary-dim flex items-center gap-1 transition-colors">
                  Learn more <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-on-surface-variant">Notify me</span>
                  <button className={`w-11 h-6 rounded-full relative transition-colors ${wl.notifying ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${wl.notifying ? 'translate-x-5' : ''}`}></div>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
