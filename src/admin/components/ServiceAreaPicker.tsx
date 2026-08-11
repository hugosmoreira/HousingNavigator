import { useMemo, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import {
  COUNTIES_BY_STATE,
  STATE_NAMES,
  SUPPORTED_STATES,
  serviceAreaLabel,
} from '../../data/serviceAreas';
import type { ServiceArea, SupportedState } from '../../types';
import { Select } from './FormField';

const STATEWIDE_VALUE = '__statewide__';

interface ServiceAreaPickerProps {
  value: ServiceArea[];
  onChange(value: ServiceArea[]): void;
  disabled?: boolean;
}

export default function ServiceAreaPicker({
  value,
  onChange,
  disabled = false,
}: ServiceAreaPickerProps) {
  const [state, setState] = useState<SupportedState>('OR');
  const [county, setCounty] = useState<string>('Multnomah');

  const counties = COUNTIES_BY_STATE[state];
  const selectedKeys = useMemo(
    () => new Set(value.map((area) => `${area.state}:${area.county ?? '*'}`)),
    [value],
  );

  function changeState(next: SupportedState) {
    setState(next);
    setCounty(COUNTIES_BY_STATE[next][0]);
  }

  function addArea() {
    const next: ServiceArea = {
      state,
      county: county === STATEWIDE_VALUE ? null : county,
    };
    const key = `${next.state}:${next.county ?? '*'}`;
    if (selectedKeys.has(key)) return;

    // A statewide selection replaces individual counties in that state; an
    // individual county replaces an existing statewide selection.
    const withoutConflicts = value.filter(
      (area) => area.state !== state || (area.county !== null && next.county !== null),
    );
    onChange([...withoutConflicts, next]);
  }

  function removeArea(index: number) {
    onChange(value.filter((_, candidateIndex) => candidateIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline gap-1 text-sm font-medium text-on-surface">
          Counties served <span className="text-error">*</span>
        </div>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          Add every county this program accepts. Choose statewide only when the official source says it serves the whole state.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
        <label>
          <span className="sr-only">State served</span>
          <Select
            value={state}
            onChange={(event) => changeState(event.target.value as SupportedState)}
            disabled={disabled}
            aria-label="State served"
          >
            {SUPPORTED_STATES.map((option) => (
              <option key={option} value={option}>
                {STATE_NAMES[option]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">County served</span>
          <Select
            value={county}
            onChange={(event) => setCounty(event.target.value)}
            disabled={disabled}
            aria-label="County served"
          >
            <option value={STATEWIDE_VALUE}>All counties (statewide)</option>
            {counties.map((option) => (
              <option key={option} value={option}>
                {option} County
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          onClick={addArea}
          disabled={disabled}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-4 text-sm font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </button>
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected service areas">
          {value.map((area, index) => (
            <li
              key={`${area.state}:${area.county ?? '*'}`}
              className="inline-flex items-center gap-2 rounded-full border border-surface-container-highest bg-surface-container-low px-3 py-1.5 text-sm text-on-surface"
            >
              <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {serviceAreaLabel(area)}
              <button
                type="button"
                onClick={() => removeArea(index)}
                disabled={disabled}
                className="rounded-full text-on-surface-variant hover:text-error disabled:opacity-60"
                aria-label={`Remove ${serviceAreaLabel(area)}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p role="alert" className="text-sm text-error">
          Add at least one county or statewide service area.
        </p>
      )}
    </div>
  );
}
