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
  const matchesMention = choices.some(choice => choice.state === location?.state && choice.county === location?.county);
  const conflict = manual && mention && !matchesMention;
  // The adjacent Area control already shows the applied location. Only ask
  // for attention when clarification or a conflicting override needs it.
  return <div id="resource-location-notice" className={needsChoice || conflict ? 'mt-3 text-sm text-on-surface-variant' : 'sr-only'}>
    <p role="status" aria-live="polite" aria-atomic="true">
      {needsChoice
        ? status === 'suggestion' ? `Did you mean one of these areas for “${mention}”?`
          : status === 'ambiguous' ? `Which area did you mean by “${mention}”?`
            : `We couldn't match “${mention}”. Choose an area above.`
        : location ? `Searching services covering ${area}, including statewide services.`
          : 'Searching across Oregon and Washington.'}
      {conflict && ` Your selected area is used instead of “${mention}” in the search.`}
    </p>
    {needsChoice && choices.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
      {choices.map(choice => <button type="button" key={`${choice.state}:${choice.county}`}
        onClick={() => onSelect(choice)}
        className="rounded-full border border-primary/30 bg-surface-container-lowest px-3 py-2 text-primary font-medium hover:bg-primary/10">
        {serviceAreaLabel(choice)}
      </button>)}
    </div>}
    {conflict && <button type="button" onClick={onUseQuery}
      className="font-semibold text-primary underline underline-offset-2 min-h-11">Use location from search</button>}
  </div>;
}
