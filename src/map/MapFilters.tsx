import { AFFORDABLE_PROPERTY_TYPE_LABELS, BEDROOM_LABELS } from '../data/affordableHousing';
import type { AffordablePropertyType, BedroomType } from '../types';
import { hasActiveFilters, usesListingOnlyFilters, type MapFilters as Filters } from './mapData';

interface Options {
  bedrooms: BedroomType[];
  amiLevels: number[];
  types: AffordablePropertyType[];
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-primary bg-primary text-on-primary'
          : 'border-surface-container-highest bg-surface-container-lowest text-on-surface-variant hover:border-primary/40 hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}

export default function MapFilters({
  filters,
  options,
  showCity,
  cityAvailable,
  onChange,
  onShowCityChange,
}: {
  filters: Filters;
  options: Options;
  showCity: boolean;
  cityAvailable: boolean;
  onChange: (filters: Filters) => void;
  onShowCityChange: (show: boolean) => void;
}) {
  const listingOnly = usesListingOnlyFilters(filters);
  return (
    <section aria-label="Filters" className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Unit sizes</legend>
        <div className="flex flex-wrap gap-2">
          {options.bedrooms.map((bedroom) => (
            <Chip
              key={bedroom}
              active={filters.bedrooms.includes(bedroom)}
              onClick={() => onChange({ ...filters, bedrooms: toggle(filters.bedrooms, bedroom) })}
            >
              {BEDROOM_LABELS[bedroom]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Income limits (% of area median income)
        </legend>
        <div className="flex flex-wrap gap-2">
          {options.amiLevels.map((level) => (
            <Chip
              key={level}
              active={filters.amiLevels.includes(level)}
              onClick={() => onChange({ ...filters, amiLevels: toggle(filters.amiLevels, level) })}
            >
              {`${level}% AMI`}
            </Chip>
          ))}
        </div>
      </fieldset>

      {options.types.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Property type</legend>
          <div className="flex flex-wrap gap-2">
            {options.types.map((type) => (
              <Chip
                key={type}
                active={filters.types.includes(type)}
                onClick={() => onChange({ ...filters, types: toggle(filters.types, type) })}
              >
                {AFFORDABLE_PROPERTY_TYPE_LABELS[type]}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm font-semibold text-on-surface">
          <input
            type="checkbox"
            checked={filters.openOnly}
            onChange={(event) => onChange({ ...filters, openOnly: event.target.checked })}
            className="h-4 w-4 rounded border-surface-container-highest text-primary focus:ring-primary/20"
          />
          Accepting applications
        </label>
        {cityAvailable && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={showCity}
              onChange={(event) => onShowCityChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-surface-container-highest text-primary focus:ring-primary/20"
            />
            <span>
              <span className="block font-semibold">City-financed buildings</span>
              <span className="block text-xs leading-relaxed text-on-surface-variant">
                Portland Housing Bureau records. Not yet verified by Housing Navigator.
              </span>
            </span>
          </label>
        )}
      </div>

      {showCity && cityAvailable && listingOnly && (
        <p role="note" className="rounded-xl bg-surface-container-low px-3 py-2 text-xs leading-relaxed text-on-surface-variant">
          City records don’t list unit sizes, property types or application status, so they are hidden while those filters are on.
        </p>
      )}

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange({ query: '', bedrooms: [], amiLevels: [], types: [], openOnly: false })}
          className="text-sm font-semibold text-primary hover:text-primary-dim"
        >
          Clear filters
        </button>
      )}
    </section>
  );
}
