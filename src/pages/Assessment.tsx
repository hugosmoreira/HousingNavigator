import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function Assessment() {
  return (
    <div className="bg-gradient-to-br from-surface to-secondary-fixed/30 min-h-[calc(100vh-80px)] py-12 flex items-center justify-center">
      <div className="max-w-2xl w-full mx-6 bg-surface-container-lowest rounded-[32px] shadow-[0px_4px_40px_rgba(0,0,0,0.06)] p-8 lg:p-12">
        <div className="flex justify-between items-center mb-8">
          <span className="text-sm font-semibold tracking-widest uppercase text-on-surface-variant">Step 1 of 3</span>
          <span className="text-sm font-medium text-on-surface-variant">Basic Needs</span>
        </div>
        
        {/* Progress Bar */}
        <div className="flex gap-2 mb-12">
          <div className="h-1.5 flex-1 bg-primary rounded-full"></div>
          <div className="h-1.5 flex-1 bg-surface-container-highest rounded-full"></div>
          <div className="h-1.5 flex-1 bg-surface-container-highest rounded-full"></div>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl lg:text-4xl font-headline font-extrabold text-on-surface mb-4 tracking-tight">Let's find the right help.</h1>
          <p className="text-on-surface-variant text-lg">Answer a few questions so we can guide you to the best resources.</p>
        </div>

        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-semibold text-on-surface mb-4">What county are you currently in?</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Multnomah', 'Clark', 'Washington', 'Clackamas', 'Other'].map((county) => (
                <button key={county} className="border border-surface-container-highest hover:border-primary hover:bg-primary/5 rounded-xl py-4 text-center font-medium text-sm transition-all text-on-surface">
                  {county}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-on-surface mb-4">What best describes your situation?</h3>
            <div className="space-y-3">
              {[
                { icon: 'hotel', label: 'Homeless' },
                { icon: 'gavel', label: 'Eviction Notice' },
                { icon: 'payments', label: 'Behind on Rent' },
                { icon: 'home', label: 'Need Long-Term Housing' }
              ].map((item) => (
                <button key={item.label} className="w-full border border-surface-container-highest hover:border-primary hover:bg-primary/5 rounded-xl py-4 px-6 flex items-center gap-4 text-left transition-all group">
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">{item.icon}</span>
                  <span className="font-medium text-on-surface">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-on-surface mb-4">Household type?</h3>
            <div className="flex flex-wrap gap-3">
              {['Single Adult', 'Family', 'Senior', 'Veteran', 'Disability'].map((type) => (
                <button key={type} className="border border-surface-container-highest hover:border-primary hover:bg-primary/5 rounded-full px-6 py-2.5 font-medium text-sm transition-all text-on-surface">
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface-container px-6 py-5 rounded-2xl flex items-center justify-between border border-surface-container-highest/50">
            <div>
              <h4 className="font-semibold text-on-surface tracking-wide">Need urgent help today?</h4>
              <p className="text-sm text-on-surface-variant mt-1">If you are in immediate danger or unsheltered tonight.</p>
            </div>
            <button className="w-12 h-6 bg-surface-container-highest rounded-full border border-outline-variant/30 relative shrink-0">
               <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm"></div>
            </button>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between pt-6 border-t border-surface-container-highest">
          <Link to="/" className="flex items-center gap-2 font-semibold text-sm px-6 py-3 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <Link to="/results" className="flex items-center gap-2 font-semibold text-sm px-8 py-3 rounded-xl bg-primary text-on-primary hover:bg-primary-dim transition-colors shadow-sm">
            Continue <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
