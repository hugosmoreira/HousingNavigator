import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
          <div className="max-w-2xl">
            <h1 className="text-[2.75rem] leading-[1.1] font-headline font-bold text-on-surface mb-6 tracking-tight">
              Find the right next step for housing help.
            </h1>
            <p className="text-lg text-on-surface-variant font-body mb-10 leading-relaxed max-w-xl">
              Get guided support for rent assistance, eviction prevention, shelter, and housing waitlists in Portland and Vancouver.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <Link to="/assessment" className="bg-primary text-on-primary px-8 py-4 rounded-full font-semibold text-base shadow-[0px_8px_24px_rgba(0,83,221,0.15)] hover:bg-primary-dim hover:shadow-[0px_12px_32px_rgba(0,83,221,0.25)] transition-all duration-300 transform hover:-translate-y-0.5 text-center">
                Start Now
              </Link>
              <Link to="/resources" className="bg-surface-container-highest text-surface-tint px-8 py-4 rounded-full font-semibold text-base hover:bg-surface-variant transition-colors text-center">
                Browse Resources
              </Link>
            </div>
          </div>

          {/* Abstract Hero Visual */}
          <div className="relative h-[500px] w-full lg:block hidden rounded-2xl overflow-hidden bg-surface-container-low shadow-[0px_12px_32px_rgba(45,51,55,0.06)]">
            <img alt="Housing Illustration" className="w-full h-full object-cover opacity-90 mix-blend-multiply" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnBPkHQMDCKUWuIHjE8rioIq3_IyFI7ZmI_vlyar6jHbLxUG_ZSdczMSOUG85zFocO5wc03NgS9TfidKPS1Sbs-Fb8xuoh8bn7YbJ46f28-xmzpYJNFYNZiNYDjEofxOhzpUysXwUoWegB4FHFnwugKcsVd-24s1WL53iYNJGQfgau5kEu7JOtV0dn9RJIbnb6W1TdrIyIPsyouW_6kMbsVLB0cyvKEIJZ9z3Skhg0L02pr0374r0a484IPjbnO2xWy7zg5qijQA" />
            
            {/* Floating UI Cards over image to simulate dashboard */}
            <div className="absolute top-10 left-10 bg-surface-container-lowest/90 backdrop-blur-md p-6 rounded-xl shadow-[0px_12px_32px_rgba(45,51,55,0.08)] max-w-xs border border-white/20">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-on-surface">Rent Assistance</h3>
                  <p className="text-xs text-on-surface-variant">Matching complete</p>
                </div>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                <div className="w-3/4 bg-primary h-full rounded-full"></div>
              </div>
            </div>
            
            <div className="absolute bottom-20 right-10 bg-surface-container-lowest/90 backdrop-blur-md p-4 rounded-xl shadow-[0px_12px_32px_rgba(45,51,55,0.08)] border border-white/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center text-tertiary-dim">
                  <span className="material-symbols-outlined">map</span>
                </div>
                <span className="font-medium text-sm text-on-surface">Portland Metro Area</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Soft background decorative element */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
      </section>

      {/* How it works (Bento Grid Style) */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl font-headline font-bold text-on-surface mb-4 tracking-tight">A clearer path forward.</h2>
            <p className="text-on-surface-variant text-lg">We've simplified the process of finding housing help into three manageable steps.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0px_8px_24px_rgba(45,51,55,0.04)] relative overflow-hidden group">
              <div className="w-14 h-14 bg-surface-container-low rounded-xl flex items-center justify-center text-primary mb-6">
                <span className="material-symbols-outlined text-3xl">assignment_ind</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">1. Tell us your situation</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                Answer a few simple questions about your current needs, location, and household. No complex government forms required.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0px_8px_24px_rgba(45,51,55,0.04)] relative overflow-hidden group transform md:-translate-y-4">
              <div className="w-14 h-14 bg-surface-container-low rounded-xl flex items-center justify-center text-primary mb-6">
                <span className="material-symbols-outlined text-3xl">fact_check</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">2. Get your best options</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                Our system securely matches you with available programs, filtering out options you aren't eligible for to save you time.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0px_8px_24px_rgba(45,51,55,0.04)] relative overflow-hidden group">
              <div className="w-14 h-14 bg-surface-container-low rounded-xl flex items-center justify-center text-primary mb-6">
                <span className="material-symbols-outlined text-3xl">flight_takeoff</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">3. Take action faster</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm">
                Connect directly with providers, join waitlists with one click, or get step-by-step guidance on next actions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="bg-surface-container-lowest rounded-3xl p-10 lg:p-16 shadow-[0px_12px_40px_rgba(45,51,55,0.05)] border border-surface-container-highest/50 flex flex-col md:flex-row items-center gap-12">
            <div className="w-full md:w-[45%] flex flex-col gap-8">
              <div className="flex items-start gap-4">
                <div className="text-tertiary-dim mt-1">
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                </div>
                <div>
                  <h4 className="font-headline font-bold text-on-surface text-lg">Built for local communities</h4>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">Designed specifically for the unique needs of the PDX region.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="text-tertiary-dim mt-1">
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                </div>
                <div>
                  <h4 className="font-headline font-bold text-on-surface text-lg">Clear and practical guidance</h4>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">Jargon-free information that tells you exactly what to do next.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="text-tertiary-dim mt-1">
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>update</span>
                </div>
                <div>
                  <h4 className="font-headline font-bold text-on-surface text-lg">Updated resources</h4>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">Real-time data on waitlists and program availability.</p>
                </div>
              </div>
            </div>
            
            <div className="w-full md:w-[55%] h-72 md:h-96 min-h-[300px] rounded-2xl overflow-hidden relative">
              <img alt="Local Community" className="absolute inset-0 w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCo2t3Mo82ItSpsTD1Dj-iPBIcWCp37hlqxAXa573NCnz94rkavuxgz_0oLa6rki0ELYsGvyy9EYQA3WoGMtjkXxP8mj8ASYyQei-6ASdqFw6-oWD2EaKvHSQ9uiadDIEIn6DBSwJkzhTOhLh-E4i7qbCG_e4c07eCWbVKVSrySQMfr3MWGHJut5TOD7E_VNFNKOUeU7N5Ksl8iSYCktjrluj21ADVdAhP4iazIGivCkt88lTUn5-V7JxQNLR98Rp-G9y0YvhmJAw" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
              <div className="absolute bottom-8 left-8 text-white">
                <p className="font-medium tracking-wide text-xs uppercase opacity-90 mb-1">Serving the Community</p>
                <p className="font-headline font-bold text-3xl mt-1">Portland & Vancouver</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
