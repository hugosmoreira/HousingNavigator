import { Link } from 'react-router-dom';
import { Compass, Search, ListChecks } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="bg-surface min-h-[calc(100vh-80px)] flex items-center">
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <Compass className="w-8 h-8" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary mb-3">
          Page not found
        </p>
        <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface tracking-tight mb-4">
          We couldn't find that page.
        </h1>
        <p className="text-on-surface-variant text-base leading-relaxed mb-8">
          The link may be out of date. Here are the two best places to start
          finding housing help.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/resources"
            className="inline-flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-semibold text-sm shadow-sm hover:bg-primary-dim transition-colors"
          >
            <Search className="w-4 h-4" aria-hidden="true" /> Find resources
          </Link>
          <Link
            to="/waitlist"
            className="inline-flex items-center justify-center gap-2 bg-surface-container-highest text-surface-tint px-6 py-3 rounded-full font-semibold text-sm hover:bg-surface-variant transition-colors"
          >
            <ListChecks className="w-4 h-4" aria-hidden="true" /> Track waitlists
          </Link>
        </div>
      </div>
    </div>
  );
}
