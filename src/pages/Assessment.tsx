import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useIntake } from '../context/IntakeContext';
import {
  COUNTY_LABELS,
  HOUSEHOLD_LABELS,
  SITUATION_LABELS,
  SITUATION_MAPPING,
  mapCounty,
  mapHousehold,
  mapSituation,
  type CountyLabel,
  type HouseholdLabel,
  type SituationLabel,
} from '../utils/intakeMapping';

const SITUATION_ICONS: Record<SituationLabel, string> = {
  Homeless: 'hotel',
  'Eviction Notice': 'gavel',
  'Behind on Rent': 'payments',
  'Need Long-Term Housing': 'home',
};

/**
 * Tailwind class variants for selection state on the three button groups.
 * Kept here so the markup below stays readable.
 */
const TILE_BASE =
  'border rounded-xl py-4 text-center font-medium text-sm transition-all text-on-surface';
const TILE_IDLE =
  'border-surface-container-highest hover:border-primary hover:bg-primary/5';
const TILE_SELECTED = 'border-primary bg-primary/10 text-primary';

const SIT_BASE =
  'w-full border rounded-xl py-4 px-6 flex items-center gap-4 text-left transition-all group';
const SIT_IDLE =
  'border-surface-container-highest hover:border-primary hover:bg-primary/5';
const SIT_SELECTED = 'border-primary bg-primary/10';

const PILL_BASE =
  'border rounded-full px-6 py-2.5 font-medium text-sm transition-all text-on-surface';
const PILL_IDLE =
  'border-surface-container-highest hover:border-primary hover:bg-primary/5';
const PILL_SELECTED = 'border-primary bg-primary/10 text-primary';

export default function Assessment() {
  const navigate = useNavigate();
  const { intake, setIntake } = useIntake();

  const [countyLabel, setCountyLabel] = useState<CountyLabel | null>(
    intake.county as CountyLabel | null,
  );
  const [situationLabel, setSituationLabel] = useState<SituationLabel | null>(() => {
    if (!intake.situation || !intake.goal) return null;
    const found = SITUATION_LABELS.find((label) => {
      const { situation, goal } = SITUATION_MAPPING[label];
      return situation === intake.situation && goal === intake.goal;
    });
    return found ?? null;
  });
  const [householdLabel, setHouseholdLabel] = useState<HouseholdLabel | null>(() => {
    if (!intake.householdType) return null;
    const found = HOUSEHOLD_LABELS.find((l) => mapHousehold(l) === intake.householdType);
    return found ?? null;
  });
  const [urgent, setUrgent] = useState<boolean>(intake.urgentHelp);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    countyLabel !== null && situationLabel !== null && householdLabel !== null;

  function handleSubmit() {
    if (!countyLabel || !situationLabel || !householdLabel) {
      setError('Please answer all three questions to continue.');
      return;
    }
    const { situation, goal } = mapSituation(situationLabel);
    setIntake({
      county: mapCounty(countyLabel),
      situation,
      goal,
      householdType: mapHousehold(householdLabel),
      urgentHelp: urgent,
    });
    navigate('/results');
  }

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
              {COUNTY_LABELS.map((county) => {
                const selected = countyLabel === county;
                return (
                  <button
                    key={county}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCountyLabel(county)}
                    className={`${TILE_BASE} ${selected ? TILE_SELECTED : TILE_IDLE}`}
                  >
                    {county}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-on-surface mb-4">What best describes your situation?</h3>
            <div className="space-y-3">
              {SITUATION_LABELS.map((label) => {
                const selected = situationLabel === label;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSituationLabel(label)}
                    className={`${SIT_BASE} ${selected ? SIT_SELECTED : SIT_IDLE}`}
                  >
                    <span
                      className={`material-symbols-outlined ${
                        selected ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'
                      }`}
                    >
                      {SITUATION_ICONS[label]}
                    </span>
                    <span className="font-medium text-on-surface">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-on-surface mb-4">Household type?</h3>
            <div className="flex flex-wrap gap-3">
              {HOUSEHOLD_LABELS.map((type) => {
                const selected = householdLabel === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setHouseholdLabel(type)}
                    className={`${PILL_BASE} ${selected ? PILL_SELECTED : PILL_IDLE}`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-surface-container px-6 py-5 rounded-2xl flex items-center justify-between border border-surface-container-highest/50">
            <div>
              <h4 className="font-semibold text-on-surface tracking-wide">Need urgent help today?</h4>
              <p className="text-sm text-on-surface-variant mt-1">If you are in immediate danger or unsheltered tonight.</p>
            </div>
            <button
              type="button"
              aria-pressed={urgent}
              onClick={() => setUrgent((v) => !v)}
              className={`w-12 h-6 rounded-full border border-outline-variant/30 relative shrink-0 transition-colors ${
                urgent ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                  urgent ? 'left-[26px]' : 'left-0.5'
                }`}
              ></div>
            </button>
          </div>

          {error && (
            <div className="text-sm text-error font-medium bg-error-container/30 border border-error/30 rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>

        <div className="mt-12 flex items-center justify-between pt-6 border-t border-surface-container-highest">
          <Link to="/" className="flex items-center gap-2 font-semibold text-sm px-6 py-3 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex items-center gap-2 font-semibold text-sm px-8 py-3 rounded-xl transition-colors shadow-sm ${
              canSubmit
                ? 'bg-primary text-on-primary hover:bg-primary-dim'
                : 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
            }`}
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
