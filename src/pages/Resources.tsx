import { useState } from 'react';
import { Search, MapPin, Calendar, ExternalLink, BookmarkPlus } from 'lucide-react';

export default function Resources() {
  const [selectedCategory, setSelectedCategory] = useState<string[]>([]);
  const [status, setStatus] = useState('All Statuses');
  const [county, setCounty] = useState('All Counties');

  const categories = ['Emergency Shelters', 'Transitional Housing', 'Rental Assistance', 'Legal Aid'];
  
  const resources = [
    {
      id: 1,
      title: 'Hope Haven Center',
      category: 'Emergency Shelter',
      description: 'Providing safe, temporary shelter and case management for families in crisis.',
      location: 'Downtown District',
      status: 'Accepting Intakes'
    },
    {
      id: 2,
      title: 'Community Action Fund',
      category: 'Rental Assistance',
      description: 'Short-term financial assistance for rent and utilities to prevent eviction.',
      location: 'County-wide',
      status: 'Waitlist Open',
      statusColor: 'text-orange-600'
    },
    {
      id: 3,
      title: 'Pathways Residency',
      category: 'Transitional Housing',
      description: 'Supportive housing program for young adults transitioning to independence.',
      location: 'North End',
      status: 'Accepting Applications',
      statusColor: 'text-green-600'
    },
    {
      id: 4,
      title: 'Tenant Rights Clinic',
      category: 'Legal Aid',
      description: 'Free legal representation and advice for renters facing housing disputes.',
      location: 'Civic Center',
      status: 'Drop-ins Welcome',
      statusColor: 'text-green-600'
    },
    {
      id: 5,
      title: 'Regional Family Services Hub',
      category: 'Comprehensive Support',
      description: 'A centralized location offering a wide range of services including housing navigation, job placement assistance, childcare referrals, and mental health counseling all under one roof.',
      location: 'Main Campus',
      phone: '(555) 123-4567',
      hours: 'Open Now (8am - 6pm)',
      spanFull: true,
      statusColor: 'text-primary'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12 flex flex-col md:flex-row gap-8 w-full">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest sticky top-28">
          <h2 className="font-headline font-bold text-xl mb-6">Filter Resources</h2>
          
          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-3 text-on-surface-variant">Category</h3>
            <div className="space-y-3">
              {categories.map((cat) => (
                <label key={cat} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary accent-primary" />
                  <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">{cat}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-3 text-on-surface-variant">Status</h3>
            <div className="space-y-3">
              {['All Statuses', 'Accepting Applications', 'Waitlist Open'].map((stat) => (
                <label key={stat} className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="status"
                    checked={status === stat}
                    onChange={() => setStatus(stat)}
                    className="w-5 h-5 rounded-full border-outline-variant text-primary focus:ring-primary accent-primary" 
                  />
                  <span className={`text-sm transition-colors ${status === stat ? 'text-on-surface font-medium' : 'text-on-surface-variant group-hover:text-on-surface'}`}>{stat}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="mb-8">
            <h3 className="font-semibold text-sm mb-3 text-on-surface-variant">County</h3>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-surface-container rounded-lg px-4 py-2.5 text-sm font-medium border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
              >
                <option>All Counties</option>
                <option>Multnomah</option>
                <option>Clark</option>
                <option>Washington</option>
                <option>Clackamas</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
              </div>
            </div>
          </div>
          
          <button className="w-full bg-surface-container-high hover:bg-surface-variant transition-colors py-2.5 rounded-lg text-primary font-semibold text-sm">
            Reset Filters
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-grow">
        <div className="mb-10 bg-surface-container-low rounded-2xl p-8 border border-surface-container-highest flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="max-w-xl">
            <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">Resource Directory</h1>
            <p className="text-on-surface-variant text-base">Find supportive services, housing assistance, and community resources tailored to your needs.</p>
          </div>
          <div className="relative w-full md:w-80 flex-shrink-0">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-on-surface-variant" />
            </div>
            <input 
              type="text" 
              placeholder="Search resources..." 
              className="w-full bg-surface-container-lowest rounded-xl pl-11 pr-4 py-3.5 shadow-sm border border-surface-container-highest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {resources.map((resource) => (
            <div 
              key={resource.id} 
              className={`bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-surface-container-highest hover:shadow-md transition-all group flex flex-col ${resource.spanFull ? 'md:col-span-2' : ''}`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  resource.category.includes('Shelter') ? 'bg-tertiary-container/50 text-tertiary-dim' : 
                  resource.category.includes('Rental') ? 'bg-secondary-container/50 text-secondary-dim' :
                  resource.category.includes('Transitional') ? 'bg-blue-100 text-blue-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {resource.category}
                </span>
                <button className="text-on-surface-variant hover:text-primary transition-colors">
                  <BookmarkPlus className="w-5 h-5" />
                </button>
              </div>
              
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2 tracking-tight group-hover:text-primary transition-colors">{resource.title}</h3>
              <p className="text-on-surface-variant text-sm mb-6 flex-grow leading-relaxed">
                {resource.description}
              </p>
              
              <div className="pt-5 border-t border-surface-container-highest/60 flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
                  <MapPin className="w-4 h-4 text-primary" />
                  {resource.location}
                </div>
                {resource.phone && (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
                    <span className="material-symbols-outlined text-[18px] text-primary">call</span>
                    {resource.phone}
                  </div>
                )}
                {resource.hours && (
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
                    <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                    {resource.hours}
                  </div>
                )}
                <div className={`flex items-center gap-2 text-sm font-semibold ml-auto ${resource.statusColor || 'text-green-600'}`}>
                  <span className="material-symbols-outlined text-[18px]">info</span>
                  {resource.status}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button className="bg-surface-container-lowest text-primary border border-surface-container-highest px-6 py-3 rounded-full font-semibold text-sm hover:bg-surface-container transition-colors shadow-sm">
            Load More Resources
          </button>
        </div>
      </div>
    </div>
  );
}
