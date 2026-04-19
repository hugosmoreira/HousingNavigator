import { ArrowRight, Save, Download, Printer } from 'lucide-react';

export default function Staff() {
  return (
    <div className="bg-surface-container-low min-h-[calc(100vh-80px)] py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row gap-8">
        
        {/* Quick Intake Form */}
        <div className="flex-grow">
          <div className="bg-surface-container-lowest rounded-[24px] shadow-sm border border-surface-container-highest overflow-hidden mb-8">
            <div className="h-1.5 w-full bg-primary"></div>
            <div className="p-8">
              <h1 className="text-2xl font-headline font-bold text-on-surface mb-8 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span> Quick Intake
              </h1>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Client Name</label>
                  <input type="text" placeholder="First Last" className="w-full bg-surface-container-lowest border border-surface-container-highest rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Household Size</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-surface-container-lowest border border-surface-container-highest rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm">
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4+</option>
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Urgency Level</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-surface-container-lowest border border-surface-container-highest rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm">
                      <option>Standard Search</option>
                      <option>Urgent (Within 7 days)</option>
                      <option>Emergency (Unsheltered tonight)</option>
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Primary Need</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-surface-container-lowest border border-surface-container-highest rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm">
                      <option>Affordable Rental</option>
                      <option>Emergency Shelter</option>
                      <option>Transitional Housing</option>
                      <option>Eviction Prevention</option>
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-[24px] shadow-sm border border-surface-container-highest p-8">
            <h2 className="text-xl font-headline font-bold text-on-surface mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">subject</span> Internal Notes (Not shared with client)
            </h2>
            <textarea 
              rows={5} 
              placeholder="Add confidential staff notes here..." 
              className="w-full bg-surface-container-lowest border border-surface-container-highest rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm mb-4 resize-none"
            ></textarea>
            <div className="flex justify-end">
              <button className="bg-primary hover:bg-primary-dim transition-colors text-on-primary px-6 py-2.5 rounded-lg font-semibold text-sm shadow-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> Save Notes
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Features */}
        <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-6">
          
          <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest p-6">
             <h3 className="font-headline font-bold text-lg mb-6 flex items-center gap-2">
               <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span> Fast Recommendations
             </h3>
             
             <div className="space-y-4 mb-6">
               <div className="bg-surface-container-low rounded-xl p-4 border border-surface-container-highest/50">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="font-bold text-sm text-on-surface">Oakwood Family Shelter</h4>
                   <span className="bg-tertiary-container/30 text-tertiary-dim text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">High Match</span>
                 </div>
                 <p className="text-xs text-on-surface-variant mb-3">Emergency shelter with family units available. Intake hours 9AM-5PM.</p>
                 <div className="flex gap-4">
                   <span className="text-[10px] font-medium text-on-surface flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">map</span> 2.4 miles</span>
                   <span className="text-[10px] font-medium text-on-surface flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">call</span> (555) 123-4567</span>
                 </div>
               </div>

               <div className="bg-surface-container-low rounded-xl p-4 border border-surface-container-highest/50">
                 <div className="flex justify-between items-start mb-2">
                   <h4 className="font-bold text-sm text-on-surface pr-4">City Rental Assistance Program</h4>
                   <span className="bg-secondary-container/50 text-secondary-dim text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide text-center shrink-0">Medium<br/>Match</span>
                 </div>
                 <p className="text-xs text-on-surface-variant mb-4">Financial aid for eviction prevention. Requires proof of income loss.</p>
                 <span className="text-[10px] font-medium text-on-surface flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">info</span> Online App Only</span>
               </div>
             </div>

             <button className="w-full text-center text-primary font-semibold text-sm hover:underline decoration-2 underline-offset-4 flex justify-center items-center gap-1">
               View Full Directory <ArrowRight className="w-4 h-4" />
             </button>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest p-6">
             <h3 className="font-headline font-bold text-lg mb-2">Export Handout</h3>
             <p className="text-xs text-on-surface-variant mb-6">Generate a personalized printout of recommendations for the client.</p>
             
             <div className="space-y-3">
               <button className="w-full bg-surface border border-surface-container-highest hover:border-primary/50 transition-colors rounded-xl px-4 py-3 flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                   <Printer className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                   <span className="font-semibold text-sm text-on-surface">Print Handout (English)</span>
                 </div>
                 <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">chevron_right</span>
               </button>
               <button className="w-full bg-surface border border-surface-container-highest hover:border-primary/50 transition-colors rounded-xl px-4 py-3 flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                   <Download className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                   <span className="font-semibold text-sm text-on-surface">Export Handout (Spanish)</span>
                 </div>
                 <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">download</span>
               </button>
               <button className="w-full bg-surface border border-surface-container-highest hover:border-primary/50 transition-colors rounded-xl px-4 py-3 flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                   <Download className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                   <span className="font-semibold text-sm text-on-surface">Export Handout (Russian)</span>
                 </div>
                 <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">download</span>
               </button>
             </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
