import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, ArrowUpRight } from 'lucide-react';
import { useIntake } from '../context/IntakeContext';
import { useRecommendationResult } from '../hooks/useRecommendationResult';
import ResultCard, { CATEGORY_LABELS } from '../components/ResultCard';
import type { ProgramCategory } from '../types';

const CATEGORY_ICONS: Record<ProgramCategory, string> = {
  emergency_shelter: 'hotel',
  transitional_housing: 'apartment',
  rental_assistance: 'payments',
  legal_aid: 'gavel',
  long_term_housing_waitlist: 'key',
  eviction_prevention: 'shield',
  comprehensive_support: 'support_agent',
};

const CATEGORY_ICON_COLORS: Record<ProgramCategory, string> = {
  emergency_shelter: 'bg-blue-100 text-blue-700',
  transitional_housing: 'bg-purple-100 text-purple-700',
  rental_assistance: 'bg-amber-100 text-amber-700',
  legal_aid: 'bg-tertiary-container text-tertiary-dim',
  long_term_housing_waitlist: 'bg-indigo-100 text-indigo-700',
  eviction_prevention: 'bg-orange-100 text-orange-700',
  comprehensive_support: 'bg-pink-100 text-pink-700',
};

export default function Results() {
  const navigate = useNavigate();
  const { intake, isComplete } = useIntake();
  const { result, loading, error } = useRecommendationResult(intake);

  useEffect(() => {
    if (!isComplete) {
      navigate('/assessment', { replace: true });
    }
  }, [isComplete, navigate]);

  if (loading || !result) {
    if (error) {
      return (
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="bg-surface-container-lowest border border-error/30 rounded-2xl p-8 text-center">
            <p className="text-error font-semibold">Couldn't load recommendations.</p>
            <p className="text-on-surface-variant text-sm mt-2">{error.message}</p>
          </div>
        </div>
      );
    }
    return null;
  }

  const { rule, recommendations, secondaryRecommendations } = result;
  const resultCount = recommendations.length;

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
              Based on your answers, here are your best current options in {intake.county} County.
            </p>
          </div>

          {/* Alert / Primary Action */}
          <div className="bg-surface-container-lowest border-l-4 border-error/80 border border-y-surface-container-highest border-r-surface-container-highest rounded-xl p-6 shadow-sm mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-error-container/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-error">warning</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-headline font-bold text-lg text-on-surface">Primary Action Today</h3>
                  {intake.urgentHelp && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/10 text-error text-[11px] font-bold uppercase tracking-wide">
                      Urgent
                    </span>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{rule.primary_action}</p>
              </div>
            </div>
            <a
              href="tel:211"
              className="shrink-0 bg-error/90 hover:bg-error transition-colors text-white px-6 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 w-full md:w-auto justify-center"
            >
              <Phone className="w-4 h-4" /> Call 211 Now
            </a>
          </div>

          {rule.caution_notes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-10">
              <h4 className="font-headline font-bold text-sm text-amber-900 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">info</span>
                Important things to know
              </h4>
              <ul className="space-y-2">
                {rule.caution_notes.map((note, idx) => (
                  <li key={idx} className="text-sm text-amber-900/90 leading-relaxed flex gap-2">
                    <span className="text-amber-600 mt-0.5">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-headline font-bold text-on-surface">Top Matches</h2>
            <span className="bg-surface-container px-3 py-1 rounded-full text-xs font-semibold text-on-surface-variant">
              {resultCount} {resultCount === 1 ? 'Result' : 'Results'}
            </span>
          </div>

          {recommendations.length === 0 ? (
            <div className="bg-surface-container-low border border-surface-container-highest rounded-2xl p-8 text-center">
              <p className="text-on-surface-variant">
                No matching programs found in {intake.county} County yet. Try{' '}
                <Link to="/resources" className="text-primary font-semibold underline">
                  the full resource directory
                </Link>{' '}
                or call 211 for personalized help.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {recommendations.map(({ program }) => (
                <ResultCard key={program.id} program={program} />
              ))}
            </div>
          )}

          {secondaryRecommendations.length > 0 && (
            <div className="mt-10 bg-surface-container-low border border-surface-container-highest rounded-2xl p-6">
              <h3 className="text-lg font-headline font-bold text-on-surface mb-2">Other options to explore</h3>
              <p className="text-sm text-on-surface-variant mb-6">These options are less direct matches but may still provide assistance based on your profile.</p>

              <div className="grid sm:grid-cols-2 gap-4">
                {secondaryRecommendations.map(({ program }) => (
                  <a
                    key={program.id}
                    href={program.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="bg-surface-container-lowest border border-surface-container-highest p-4 rounded-xl flex items-center justify-between group hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${CATEGORY_ICON_COLORS[program.category]}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {CATEGORY_ICONS[program.category]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{program.program_name}</div>
                        <div className="text-xs text-on-surface-variant">
                          {CATEGORY_LABELS[program.category]}
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors shrink-0 ml-2" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <aside className="w-full md:w-72 flex-shrink-0 flex flex-col gap-6">
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 shadow-sm sticky top-28">
            <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">folder_open</span> Prepare these documents
            </h3>
            <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">Having these ready will speed up your application process for the programs listed.</p>

            <div className="space-y-4">
              {rule.recommended_documents.map((doc, idx) => (
                <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary accent-primary"
                  />
                  <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors font-medium">
                    {doc}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
            <h3 className="font-headline font-bold text-lg mb-2">Need help navigating?</h3>
            <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">Our housing specialists are available to walk through these options with you.</p>
            <Link to="/resources" className="text-primary font-semibold text-sm flex items-center gap-1.5 hover:underline decoration-2 underline-offset-4">
              Browse the full directory <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
