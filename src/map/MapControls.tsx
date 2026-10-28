import type { CSSProperties } from 'react';
import { Compass, Minus, Moon, Play, Plus, Scan, Sun } from 'lucide-react';
import type { MapTheme } from './mapStyle';
import type { MapView } from './mapUrlState';

const button =
  'inline-flex h-11 w-11 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';
const group =
  'flex flex-col overflow-hidden rounded-2xl border border-surface-container-highest bg-surface-container-lowest/95 shadow-lg backdrop-blur';

export default function MapControls({
  view,
  theme,
  bearing,
  onView,
  onTheme,
  onZoom,
  onNorth,
  onOverview,
  onTour,
  className = '',
  style,
  compact = false,
  showZoom = true,
}: {
  view: MapView;
  theme: MapTheme;
  bearing: number;
  onView: (view: MapView) => void;
  onTheme: (theme: MapTheme) => void;
  onZoom: (delta: number) => void;
  onNorth: () => void;
  onOverview: () => void;
  onTour: () => void;
  className?: string;
  style?: CSSProperties;
  /** When space is short, keep only the view toggle and compass. */
  compact?: boolean;
  /** Phones pinch to zoom, so the zoom buttons are left out there. */
  showZoom?: boolean;
}) {
  return (
    <div className={`flex flex-col items-end gap-2 ${className}`} style={style}>
      <div role="radiogroup" aria-label="Map view" className={`${group} p-1`}>
        {(['2d', '3d'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={view === option}
            onClick={() => onView(option)}
            className={`h-9 w-11 rounded-xl text-xs font-bold tracking-wide transition-colors ${
              view === option ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
      <div className={group}>
        {showZoom && (
          <>
            <button type="button" aria-label="Zoom in" className={button} onClick={() => onZoom(1)}>
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Zoom out" className={`${button} border-t border-surface-container-highest`} onClick={() => onZoom(-1)}>
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label="Point the map north"
          className={`${button} ${showZoom ? 'border-t border-surface-container-highest' : ''}`}
          onClick={onNorth}
        >
          <Compass
            className="h-5 w-5 transition-transform"
            style={{ transform: `rotate(${-bearing - 45}deg)` }}
            aria-hidden="true"
          />
        </button>
      </div>
      {!compact && (
        <div className={group}>
          <button type="button" aria-label="Show all of Portland" title="Show all of Portland" className={button} onClick={onOverview}>
            <Scan className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={theme === 'day' ? 'Switch to night map' : 'Switch to day map'}
            title={theme === 'day' ? 'Night map' : 'Day map'}
            className={`${button} border-t border-surface-container-highest`}
            onClick={() => onTheme(theme === 'day' ? 'night' : 'day')}
          >
            {theme === 'day' ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            aria-label="Take a guided tour"
            title="Guided tour"
            className={`${button} border-t border-surface-container-highest`}
            onClick={onTour}
          >
            <Play className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
