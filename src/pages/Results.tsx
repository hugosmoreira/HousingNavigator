import { BookmarkPlus, Phone, ArrowUpRight } from 'lucide-react';

export default function Results() {
  return (
    <div className="bg-surface min-h-[calc(100vh-80px)] py-12">
      <div className="max-w-4xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row gap-10">
        
        {/* Main Content */}
        <div className="flex-grow">
          <div className="mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-container/30 text-tertiary-dim text-xs font-semibold tracking-wide mb-6">
              <span className="material-symbols-outlined text-[14px]">check_circle</span> Assessment Complete
            </span>
            <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">Recommended Next Steps</h1>
            <p className="text-on-surface-variant text-base leading-relaxed">
              Based on your answers, here are your best current options.
            </p>
          </div>

          {/* Alert / Primary Action */}
          <div className="bg-surface-container-lowest border-l-4 border-error/80 border border-y-surface-container-highest border-r-surface-container-highest rounded-xl p-6 shadow-sm mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-error-container/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-error">warning</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-lg text-on-surface">Primary Action Today</h3>
                <p className="text-sm text-on-surface-variant mt-1">Call 211 for immediate shelter placement.</p>
              </div>
            </div>
            <button className="shrink-0 bg-error/90 hover:bg-error transition-colors text-white px-6 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 w-full md:w-auto justify-center">
              <Phone className="w-4 h-4" /> Call 211 Now
            </button>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-headline font-bold text-on-surface">Top Matches</h2>
            <span className="bg-surface-container px-3 py-1 rounded-full text-xs font-semibold text-on-surface-variant">3 Results</span>
          </div>

          <div className="space-y-6">
            {/* Result Card 1 */}
            <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold uppercase tracking-wide">Emergency Shelter</span>
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold flex items-center gap-1">
                     <span className="material-symbols-outlined text-[14px]">check_circle</span> Open Now
                  </span>
                </div>
                <button className="text-on-surface-variant hover:text-primary transition-colors">
                  <BookmarkPlus className="w-5 h-5" />
                </button>
              </div>
              
              <h3 className="text-2xl font-headline font-bold text-on-surface mb-6 tracking-tight">Safe Haven Shelter Program</h3>
              
              <div className="bg-surface-container-low rounded-xl p-4 flex gap-3 mb-6 border border-surface-container-highest/50">
                <span className="material-symbols-outlined text-primary shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  <strong className="text-on-surface">Why it may fit you:</strong> They specifically accept families with children and are located within your preferred transit zone. They currently have family units available.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">How to apply</span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="material-symbols-outlined text-[16px]">person_add</span> Walk-in or Phone
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Phone</span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="material-symbols-outlined text-[16px]">call</span> (555) 123-4567
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Requirements</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2.5 py-1 bg-surface-container-highest text-on-surface-variant text-xs font-medium rounded-md flex items-center gap-1.5 border border-outline-variant/20"><span className="material-symbols-outlined text-[14px]">assignment_turned_in</span> Referral required</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-surface-container-highest flex items-center justify-between">
                <span className="text-xs text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">history</span> Last verified: Today, 9:00 AM</span>
                <button className="bg-primary text-on-primary px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-dim transition-colors shadow-sm">
                  Visit Website
                </button>
              </div>
            </div>

            {/* Result Card 2 */}
            <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold uppercase tracking-wide">Transitional Housing</span>
                  <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold flex items-center gap-1">
                     <span className="material-symbols-outlined text-[14px]">hourglass_empty</span> Limited Space
                  </span>
                </div>
                <button className="text-on-surface-variant hover:text-primary transition-colors">
                  <BookmarkPlus className="w-5 h-5" />
                </button>
              </div>
              
              <h3 className="text-2xl font-headline font-bold text-on-surface mb-6 tracking-tight">Hope Transitions Community</h3>
              
              <div className="bg-surface-container-low rounded-xl p-4 flex gap-3 mb-6 border border-surface-container-highest/50">
                <span className="material-symbols-outlined text-primary shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  <strong className="text-on-surface">Why it may fit you:</strong> Offers 6-12 month stays with employment assistance, matching your goal of securing steady work.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">How to apply</span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="material-symbols-outlined text-[16px]">computer</span> Online Application
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Phone</span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="material-symbols-outlined text-[16px]">call</span> (555) 987-6543
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-surface-container-highest flex items-center justify-between">
                <span className="text-xs text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">history</span> Last verified: 2 days ago</span>
                <button className="bg-surface-container-highest text-primary px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-surface-variant transition-colors">
                  Visit Website
                </button>
              </div>
            </div>
          </div>

          <div className="mt-10 bg-surface-container-low border border-surface-container-highest rounded-2xl p-6">
            <h3 className="text-lg font-headline font-bold text-on-surface mb-2">Other options to explore</h3>
            <p className="text-sm text-on-surface-variant mb-6">These options are less direct matches but may still provide assistance based on your profile.</p>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <button className="bg-surface-container-lowest border border-surface-container-highest p-4 rounded-xl flex items-center justify-between group hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                    <span className="material-symbols-outlined text-[16px]">payments</span>
                  </div>
                  <span className="font-semibold text-sm">Rental Assistance Programs</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
              </button>
              <button className="bg-surface-container-lowest border border-surface-container-highest p-4 rounded-xl flex items-center justify-between group hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700">
                    <span className="material-symbols-outlined text-[16px]">gavel</span>
                  </div>
                  <span className="font-semibold text-sm">Legal Aid for Evictions</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <aside className="w-full md:w-72 flex-shrink-0 flex flex-col gap-6">
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 shadow-sm sticky top-28">
            <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">folder_open</span> Prepare these documents
            </h3>
            <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">Having these ready will speed up your application process for the programs listed.</p>
            
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary accent-primary" />
                <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">Valid Government ID</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary accent-primary" />
                <div className="flex flex-col">
                  <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">Proof of Income</span>
                  <span className="text-[10px] text-on-surface-variant opacity-70">(Last 30 days)</span>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary accent-primary" />
                <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">Current Lease</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary accent-primary" />
                <div className="flex flex-col">
                  <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">Notice Letter</span>
                  <span className="text-[10px] text-on-surface-variant opacity-70">(Eviction notice if applicable)</span>
                </div>
              </label>
            </div>
          </div>
          
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
            <h3 className="font-headline font-bold text-lg mb-2">Need help navigating?</h3>
            <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">Our housing specialists are available to walk through these options with you.</p>
            <a href="#" className="text-primary font-semibold text-sm flex items-center gap-1.5 hover:underline decoration-2 underline-offset-4">
              Chat with a specialist <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
          </div>
        </aside>

      </div>
    </div>
  );
}
