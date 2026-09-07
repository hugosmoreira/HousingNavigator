import { serviceAreaLabel } from '../data/serviceAreas';
import type { ServiceArea } from '../types';
import type { resourceSearchContext } from '../utils/resourceSearchLocation';

interface Props {
  context: ReturnType<typeof resourceSearchContext>;
  onSelect: (location: ServiceArea) => void;
  onUseQuery: () => void;
}

export default function ResourceLocationNotice({ context, onSelect, onUseQuery }: Props) {
  const { mention, location, needsChoice, choices, status, manual } = context;
  const area = location ? serviceAreaLabel(location) : 'Oregon and Washington';
  return <div id="resource-location-notice" className="mt-3 max-w-3xl text-sm text-on-surface-variant">
    <p role="status" aria-live="polite" aria-atomic="true">
      {needsChoice
        ? status === 'suggestion' ? `Did you mean one of these areas for “${mention}”?`
          : status === 'ambiguous' ? `Choose a state or county for “${mention}”.`
            : `We couldn't match “${mention}” to an area. Choose a state and county below.`
        : location ? `Searching services covering ${area}, including statewide services.`
          : 'Searching across Oregon and Washington.'}
      {manual && mention && ` Your selected area is used instead of “${mention}” in the search.`}
    </p>
    {needsChoice && choices.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
      {choices.map(choice => <button type="button" key={`${choice.state}:${choice.county}`}
        onClick={() => onSelect(choice)}
        className="rounded-full border border-primary/30 bg-surface-container-lowest px-3 py-2 text-primary font-medium hover:bg-primary/10">
        {serviceAreaLabel(choice)}
      </button>)}
    </div>}
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
      <a href="#resource-area-filter" className="font-semibold text-primary underline underline-offset-2">
        {needsChoice ? 'Select area' : 'Change area'}
      </a>
      {manual && mention && <button type="button" onClick={onUseQuery}
        className="font-semibold text-primary underline underline-offset-2">Use location from search</button>}
    </div>
  </div>;
}
