import { Heart, Search, Eye, Map } from 'lucide-react';

export default function Mission() {
  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="max-w-3xl mb-16">
          <h1 className="text-4xl lg:text-[2.75rem] font-headline font-bold text-on-surface mb-6 tracking-tight">Why Housing Navigator Exists</h1>
          <p className="text-lg text-on-surface-variant font-body leading-relaxed">
            Navigating housing support in the Portland and Vancouver metro area shouldn't feel like wandering through a maze blindfolded. We built Housing Navigator to cut through the fragmentation, clarify the confusion, and make the very "next step" apparent for everyone seeking stable housing.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-surface-container-low rounded-3xl p-10 lg:p-12">
            <h2 className="text-2xl font-headline font-bold text-on-surface mb-6">The Fragmentation Problem</h2>
            <div className="space-y-6 text-on-surface-variant leading-relaxed">
              <p>
                For decades, individuals and families facing housing instability have been forced to navigate a disjointed ecosystem. Applications are scattered across different agencies, waitlists are opaque, and the sheer volume of paperwork creates unnecessary barriers during moments of crisis.
              </p>
              <p>
                Housing Navigator was born from a simple belief: the process of finding a home shouldn't be harder than the circumstances that led you to search for one. By centralizing resources, clarifying eligibility, and providing empathetic guidance, we aim to transform a stressful ordeal into a clear, manageable journey.
              </p>
            </div>
          </div>
          
          <div className="rounded-3xl overflow-hidden relative min-h-[300px] bg-slate-800">
            {/* Visual map placeholder representing Portland/Vancouver */}
            <div className="absolute inset-0 opacity-40 bg-[url('https://lh3.googleusercontent.com/aida-public/AB6AXuCo2t3Mo82ItSpsTD1Dj-iPBIcWCp37hlqxAXa573NCnz94rkavuxgz_0oLa6rki0ELYsGvyy9EYQA3WoGMtjkXxP8mj8ASYyQei-6ASdqFw6-oWD2EaKvHSQ9uiadDIEIn6DBSwJkzhTOhLh-E4i7qbCG_e4c07eCWbVKVSrySQMfr3MWGHJut5TOD7E_VNFNKOUeU7N5Ksl8iSYCktjrluj21ADVdAhP4iazIGivCkt88lTUn5-V7JxQNLR98Rp-G9y0YvhmJAw')] bg-cover bg-center mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
            
            {/* Dots representing connections/nodes on the map */}
            <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 100 100" preserveAspectRatio="none">
              <circle cx="30" cy="40" r="1.5" fill="#e3c7f7" />
              <circle cx="50" cy="50" r="1.5" fill="#e3c7f7" />
              <circle cx="70" cy="30" r="1.5" fill="#e3c7f7" />
              <circle cx="45" cy="70" r="1.5" fill="#e3c7f7" />
              <path d="M30 40 L50 50 L70 30 M50 50 L45 70" stroke="rgba(227, 199, 247, 0.3)" strokeWidth="0.5" fill="none" />
            </svg>

            <div className="absolute bottom-6 left-6">
              <div className="bg-surface/90 backdrop-blur-sm px-4 py-2 rounded-lg inline-flex items-center gap-2 text-primary text-sm font-semibold">
                <MapPin className="w-4 h-4" />
                Serving PDX / Vancouver
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8">
            <div className="w-12 h-12 rounded-xl bg-secondary-container/50 text-tertiary-dim flex items-center justify-center mb-6">
              <Eye className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Clarity First</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              No jargon. No hidden steps. We translate complex agency requirements into plain language that empowers you to act.
            </p>
          </div>

          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8">
            <div className="w-12 h-12 rounded-xl bg-tertiary-container/50 text-tertiary flex items-center justify-center mb-6">
              <Heart className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Empathetic Support</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              We design for the human experiencing the crisis, offering a digital sanctuary that reassures rather than overwhelms.
            </p>
          </div>

          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-6">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface mb-3">Unified Network</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              Connecting the dots between local shelters, transition programs, and permanent housing solutions in one place.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
