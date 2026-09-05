import { DIRECTORY_CATEGORY_LABELS } from '../data/categoryMap';
import { RESOURCE_SERVICE_TAGS, RESOURCE_SERVICE_LABELS } from '../data/resourceServiceTags';
import type { DirectoryCategory, ResourceServiceTag } from '../types';

interface Props {
  expanded: boolean;
  extraCategories: DirectoryCategory[];
  categories: DirectoryCategory[];
  tags: ResourceServiceTag[];
  onCategory: (value: DirectoryCategory) => void;
  onTag: (value: ResourceServiceTag) => void;
}
export default function ResourceMoreFilters({ expanded, extraCategories, categories, tags, onCategory, onTag }: Props) {
  if (!expanded) {
    const selected = extraCategories.filter((category) => categories.includes(category));
    if (!tags.length && !selected.length) return null;
    return <div className="mt-2 flex flex-wrap gap-2" aria-label="Selected additional filters">
      {tags.map((tag) => <button key={tag} type="button" onClick={() => onTag(tag)}
        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
        aria-label={'Remove ' + RESOURCE_SERVICE_LABELS[tag] + ' filter'}>
        {RESOURCE_SERVICE_LABELS[tag]} ×
      </button>)}
      {selected.map((category) => <button key={category} type="button" onClick={() => onCategory(category)}
        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
        aria-label={'Remove ' + DIRECTORY_CATEGORY_LABELS[category] + ' filter'}>
        {DIRECTORY_CATEGORY_LABELS[category]} ×
      </button>)}
    </div>;
  }
  return <div id="additional-resource-filters" className="mt-3 max-h-[40vh] overflow-y-auto rounded-xl border border-surface-container-highest bg-surface-container-lowest p-4">
    <p className="mb-3 text-xs text-on-surface-variant">Choose the help you need. Multiple choices within a group include either option.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Additional support</legend>
        <div className="grid grid-cols-1 gap-1">
          {RESOURCE_SERVICE_TAGS.map((tag) => <label key={tag} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-container-low">
            <input type="checkbox" checked={tags.includes(tag)} onChange={() => onTag(tag)} className="h-4 w-4 accent-primary" />
            {RESOURCE_SERVICE_LABELS[tag]}
          </label>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Other resource types</legend>
        {extraCategories.map((category) => <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-container-low">
          <input type="checkbox" checked={categories.includes(category)} onChange={() => onCategory(category)} className="h-4 w-4 accent-primary" />
          {DIRECTORY_CATEGORY_LABELS[category]}
        </label>)}
      </fieldset>
    </div>
  </div>;
}
