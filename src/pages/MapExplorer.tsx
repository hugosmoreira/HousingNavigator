import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle, Building2, ChevronDown, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import type { PaddingOptions } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useAffordableProperties } from '../hooks/useAffordableProperties';
import { affordablePropertyPath } from '../lib/entityRoutes';
import BottomSheet, { sheetHeight, type SheetSnap } from '../map/BottomSheet';
import DataPanel from '../map/DataPanel';
import MapCanvas, { MapErrorBoundary, type MapCanvasHandle } from '../map/MapCanvas';
import MapControls from '../map/MapControls';
import MapFilters from '../map/MapFilters';
import MapSearch, { type SearchResult } from '../map/MapSearch';
import MapStats from '../map/MapStats';
import PlaceList from '../map/PlaceList';
import PropertyDetails from '../map/PropertyDetails';
import { isLowPowerDevice, supportsWebGL2 } from '../map/device';
import type { MapPoint } from '../map/housingMap';
import {
  buildMapItems,
  cityBreakdowns,
  cityKey,
  filterItems,
  findBreakdown,
  hasActiveFilters,
  itemsInBounds,
  listingKey,
  toMapProperties,
  viewportStats,
  type Breakdown,
  type MapBounds,
  type MapFilters as Filters,
  type MapItem,
} from '../map/mapData';
import { PALETTES, type MapTheme } from '../map/mapStyle';
import {
  parseMapUrlState,
  serializeMapUrlState,
  type CameraState,
  type MapMode,
  type MapView,
  type FocusRef,
} from '../map/mapUrlState';
import { useMediaQuery, useReducedMotion } from '../map/motion';
import { PORTLAND_OVERVIEW } from '../map/places';
import {
  loadRentalPortfolio,
  matchListings,
  regulatedStats,
  type PortlandRentalPortfolioFile,
} from '../map/regulatedHousing';
import { buildTour, type TourStep } from '../map/tour';
import '../map/map-ui.css';

const THEME_KEY = 'hn-map-theme';
const DESKTOP_PANEL_WIDTH = 400;
const TOUR_STEP_MS = 7000;
const NEIGHBORHOODS_URL = '/data/portland-neighborhoods.json';

// Opening shot: the downtown skyline, before the camera pulls back over the city.
const INTRO_CAMERA: CameraState = { lat: 45.5185, lng: -122.6768, zoom: 15.4, pitch: 62, bearing: -38 };

function overviewCamera(view: MapView, desktop: boolean): CameraState {
  return {
    lat: PORTLAND_OVERVIEW.lat,
    // Phones are narrow; shift west so downtown is not at the edge.
    lng: PORTLAND_OVERVIEW.lng - (desktop ? 0 : 0.03),
    zoom: PORTLAND_OVERVIEW.zoom + (desktop ? 0.25 : -0.45),
    pitch: view === '3d' ? 52 : 0,
    bearing: view === '3d' ? -18 : 0,
  };
}

function readTheme(): MapTheme {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'night' ? 'night' : 'day';
  } catch {
    return 'day';
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function MapExplorer() {
  const [searchParams] = useSearchParams();
  // The URL seeds the first render only; afterwards the page writes it.
  const [initialUrl] = useState(() => parseMapUrlState(searchParams));
  const { properties, error: liveError } = useAffordableProperties();
  const [cityFile, setCityFile] = useState<PortlandRentalPortfolioFile | null>(null);
  const [cityState, setCityState] = useState<'loading' | 'ready' | 'error'>('loading');

  const reducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [lowPower] = useState(isLowPowerDevice);
  const [webgl] = useState(supportsWebGL2);

  const [mode, setMode] = useState<MapMode>(initialUrl.mode);
  const [view, setView] = useState<MapView>(initialUrl.view ?? (lowPower ? '2d' : '3d'));
  const [theme, setTheme] = useState<MapTheme>(readTheme);
  const [filters, setFilters] = useState<Filters>(initialUrl.filters);
  const [showCity, setShowCity] = useState(initialUrl.showCity);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialUrl.property ? listingKey(initialUrl.property) : initialUrl.city ? cityKey(initialUrl.city) : null,
  );
  const [focus, setFocus] = useState<FocusRef | null>(initialUrl.focus);
  const [hoodShapes, setHoodShapes] = useState<FeatureCollection | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [camera, setCamera] = useState<CameraState | null>(initialUrl.camera);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>(webgl ? 'loading' : 'error');
  const [mapProblem, setMapProblem] = useState<'webgl' | 'tiles' | 'engine' | null>(webgl ? null : 'webgl');
  const [sheet, setSheet] = useState<SheetSnap>(initialUrl.property || initialUrl.city ? 'half' : 'peek');
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters(initialUrl.filters));
  const [tour, setTour] = useState<{ steps: TourStep[]; index: number; playing: boolean } | null>(null);
  const [containerHeight, setContainerHeight] = useState(800);

  const canvasRef = useRef<MapCanvasHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [initialCamera] = useState<CameraState>(() => initialUrl.camera ?? overviewCamera(view, isDesktop));
  // Only wide screens get the opening flight. It starts at street level
  // downtown, the heaviest tiles in the city, and nothing draws until they
  // arrive: on a phone over slow 4G the first map took 10 s instead of 8 s,
  // and the flight ran until 14 s.
  const [introFrom] = useState<CameraState | null>(() =>
    isDesktop && !initialUrl.camera && !selectedKey && !focus && view === '3d' && !lowPower && !reducedMotion
      ? INTRO_CAMERA
      : null,
  );

  useEffect(() => {
    const controller = new AbortController();
    loadRentalPortfolio(controller.signal)
      .then((file) => {
        setCityFile(file);
        setCityState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setCityState('error');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (mode !== 'data' || hoodShapes) return;
    const controller = new AbortController();
    fetch(NEIGHBORHOODS_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: FeatureCollection | null) => {
        if (data?.features) setHoodShapes(data);
      })
      .catch(() => {
        // Shading is optional; the charts still work without it.
      });
    return () => controller.abort();
  }, [mode, hoodShapes]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setContainerHeight(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Private browsing can block storage; the theme just won't persist.
    }
  }, [theme]);

  // ---- Data ---------------------------------------------------------------
  const listings = useMemo(() => toMapProperties(properties), [properties]);
  const records = useMemo(() => cityFile?.records ?? [], [cityFile]);
  const matches = useMemo(() => matchListings(records, listings), [records, listings]);
  const items = useMemo(() => buildMapItems(listings, records, matches), [listings, records, matches]);
  const visibleItems = useMemo(() => filterItems(items, filters, showCity), [items, filters, showCity]);
  const inView = useMemo(() => (bounds ? itemsInBounds(visibleItems, bounds) : visibleItems), [visibleItems, bounds]);
  const unmapped = useMemo(() => listings.filter((listing) => !listing.location), [listings]);
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  const selectedItem = selectedKey ? itemByKey.get(selectedKey) ?? null : null;

  // ---- Data view ------------------------------------------------------------
  const breakdowns = useMemo(() => cityBreakdowns(items), [items]);
  const focused = useMemo(
    () => (focus ? findBreakdown(breakdowns, focus.kind, focus.value) : null),
    [breakdowns, focus],
  );
  const focusKeys = useMemo(() => new Set(focused?.keys ?? []), [focused]);
  const dataTotals = useMemo(() => {
    const cityRecords = items.filter((item) => item.city).map((item) => item.city!);
    return {
      ...regulatedStats(cityRecords),
      totalHomes: cityRecords.reduce((total, record) => total + (record.total_units ?? 0), 0),
    };
  }, [items]);
  const hoodData = useMemo<FeatureCollection | null>(() => {
    if (!hoodShapes) return null;
    const homes = new Map(breakdowns.neighborhoods.map((entry) => [entry.value, entry.homes]));
    return {
      ...hoodShapes,
      features: hoodShapes.features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, homes: homes.get(String(feature.properties?.name)) ?? 0 },
      })),
    };
  }, [hoodShapes, breakdowns]);

  // In the data view, buildings outside the picked group fade to grey.
  const pointColor = useCallback(
    (item: MapItem): string | null =>
      mode === 'data' && focused && !focusKeys.has(item.key) ? PALETTES[theme].muted : null,
    [mode, focused, focusKeys, theme],
  );

  const swatch = useCallback(
    (item: MapItem) => {
      const palette = PALETTES[theme];
      if (item.open) return palette.propertyOpen;
      return pointColor(item) ?? (item.kind === 'city' ? palette.city : palette.property);
    },
    [pointColor, theme],
  );

  // The data view describes every City record, so listing filters do not apply there.
  const mapItems = mode === 'data' ? items : visibleItems;
  const points = useMemo<MapPoint[]>(
    () =>
      mapItems.map((item) => ({
        key: item.key,
        kind: item.kind,
        name: item.name,
        lng: item.lng,
        lat: item.lat,
        color: pointColor(item),
        open: item.open,
        units: item.units,
      })),
    [mapItems, pointColor],
  );

  const emphasisKeys = useMemo(() => (mode === 'data' && focused ? focused.keys : null), [mode, focused]);

  const listingStats = useMemo(
    () => viewportStats(inView.filter((item) => item.listing).map((item) => item.listing!)),
    [inView],
  );
  const cityStats = useMemo(
    () => (showCity && cityFile ? regulatedStats(inView.filter((item) => item.city).map((item) => item.city!)) : null),
    [inView, showCity, cityFile],
  );
  const listingsOutOfView = useMemo(
    () => visibleItems.filter((item) => item.kind === 'listing').length - listingStats.properties,
    [visibleItems, listingStats],
  );

  const filterOptions = useMemo(() => {
    const bedrooms = new Set<string>();
    const ami = new Set<number>();
    const types = new Set<string>();
    for (const listing of listings) {
      listing.property.bedroom_types.forEach((value) => bedrooms.add(value));
      listing.property.ami_levels.forEach((value) => ami.add(value));
      types.add(listing.property.property_type);
    }
    for (const record of records) Object.keys(record.ami_units).forEach((tier) => ami.add(Number(tier)));
    const order = ['studio', 'sro', '1', '2', '3', '4_plus'];
    return {
      bedrooms: order.filter((value) => bedrooms.has(value)) as Filters['bedrooms'],
      amiLevels: [30, 40, 50, 60, 80].filter((value) => ami.has(value)),
      types: [...types].sort() as Filters['types'],
    };
  }, [listings, records]);

  // ---- URL sharing ----------------------------------------------------------
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const property = selectedItem?.kind === 'listing' ? selectedItem.listing!.slug : null;
      const city = selectedItem?.kind === 'city' ? selectedItem.city!.id : null;
      const params = serializeMapUrlState({
        mode,
        view,
        property,
        city,
        focus: mode === 'data' ? focus : null,
        filters,
        showCity,
        camera,
      });
      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
      if (next !== `${window.location.pathname}${window.location.search}`) {
        // replaceState keeps React Router's history entry and avoids a re-render per pan.
        window.history.replaceState(window.history.state, '', next);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [mode, view, selectedItem, focus, filters, showCity, camera]);

  // ---- Camera helpers -------------------------------------------------------
  const sheetPx = sheetHeight(sheet, containerHeight);
  // Vertical room for the floating controls between the search bar and the sheet.
  const controlsRoom = containerHeight - Math.min(sheetPx, 420) - 12 - 76;
  const layout = useRef({ isDesktop, sheetPx, touring: false, sheet, containerHeight });
  layout.current = { isDesktop, sheetPx, touring: tour !== null, sheet, containerHeight };
  const padding = useCallback((): PaddingOptions => {
    const { isDesktop: desktop, sheetPx: sheetHeightPx, touring } = layout.current;
    // The tour card sits over the top of the map; keep tour stops below it.
    return desktop
      ? { top: touring ? 220 : 24, bottom: 24, left: DESKTOP_PANEL_WIDTH + 36, right: 84 }
      : { top: touring ? 250 : 76, bottom: Math.min(sheetHeightPx, 420) + 12, left: 12, right: 64 };
  }, []);

  const focusItem = useCallback((item: MapItem) => {
    canvasRef.current?.flyTo({ lng: item.lng, lat: item.lat });
  }, []);

  const selectItem = useCallback(
    (item: MapItem | null, fly = true) => {
      setSelectedKey(item?.key ?? null);
      if (!item) return;
      // Open the sheet first and fly with the padding it will have, so the
      // property is not left behind the sheet's top edge.
      const { sheet: snap, containerHeight: height } = layout.current;
      const nextSnap = snap === 'peek' ? 'half' : snap;
      layout.current.sheetPx = sheetHeight(nextSnap, height);
      setSheet(nextSnap);
      if (fly) focusItem(item);
    },
    [focusItem],
  );

  const showOverview = useCallback(() => {
    const target = overviewCamera(view, layout.current.isDesktop);
    canvasRef.current?.flyTo({ lng: target.lng, lat: target.lat, zoom: target.zoom });
  }, [view]);

  const selectFocus = useCallback(
    (next: FocusRef | null, row: Breakdown | null) => {
      setFocus(next);
      setSelectedKey(null);
      if (!row) return;
      const keys = new Set(row.keys);
      canvasRef.current?.fitPoints(items.filter((item) => keys.has(item.key)), 15);
    },
    [items],
  );

  const focusNeighborhood = useCallback(
    (name: string) => {
      const row = findBreakdown(breakdowns, 'neighborhood', name);
      const already = focus?.kind === 'neighborhood' && focus.value === name;
      selectFocus(already || !row ? null : { kind: 'neighborhood', value: name }, already ? null : row);
    },
    [breakdowns, focus, selectFocus],
  );

  function handlePick(result: SearchResult) {
    setTour(null);
    switch (result.type) {
      case 'all': {
        const next = { ...filters, query: result.query };
        setFilters(next);
        setSelectedKey(null);
        canvasRef.current?.fitPoints(filterItems(items, next, showCity), 15);
        break;
      }
      case 'item':
        selectItem(result.item);
        break;
      case 'place':
        setSelectedKey(null);
        canvasRef.current?.flyTo({ lng: result.place.lng, lat: result.place.lat, zoom: result.place.zoom });
        break;
      case 'neighborhood':
        setSelectedKey(null);
        canvasRef.current?.fitPoints(result.items, 15);
        break;
    }
  }

  // Deep links: once the map is ready, bring the shared selection into view.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (mapState !== 'ready' || deepLinkHandled.current || initialUrl.camera) return;
    if ((selectedKey || focus) && cityState === 'loading') return;
    deepLinkHandled.current = true;
    if (selectedItem) focusItem(selectedItem);
    else if (focus && focused) selectFocus(focus, focused);
  }, [mapState, selectedItem, selectedKey, focus, focused, cityState, initialUrl.camera, focusItem, selectFocus]);

  // A new card or mode starts at the top of the panel, not mid-scroll.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-map-panel-scroll]').forEach((element) => {
      element.scrollTop = 0;
    });
  }, [selectedKey, mode]);

  // ---- Tour -----------------------------------------------------------------
  const tourStep = tour ? tour.steps[tour.index] : null;
  useEffect(() => {
    if (!tourStep) return;
    if (tourStep.fit) canvasRef.current?.fitPoints(tourStep.fit, 14.5);
    else if (tourStep.fly) canvasRef.current?.flyTo(tourStep.fly);
    setSelectedKey(tourStep.select ?? null);
  }, [tourStep]);

  useEffect(() => {
    if (!tour?.playing || reducedMotion) return;
    if (tour.index >= tour.steps.length - 1) return;
    const timer = window.setTimeout(
      () => setTour((current) => (current ? { ...current, index: current.index + 1 } : current)),
      TOUR_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [tour, reducedMotion]);

  function startTour() {
    if (view === '2d') setView('3d');
    setMode('housing');
    setFocus(null);
    setTour({ steps: buildTour(items, showCity), index: 0, playing: !reducedMotion });
    setSheet('peek');
  }

  // ---- Panels ---------------------------------------------------------------
  const citySource = cityFile ? { metadataUrl: cityFile.metadata_url, retrievedOn: cityFile.retrieved_on } : null;

  const modeTabs = (
    <div role="tablist" aria-label="Map mode" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-container-high p-1">
      {(
        [
          ['housing', 'Find housing'],
          ['data', 'Explore the data'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => {
            setMode(value);
            setTour(null);
            if (value === 'housing') setFocus(null);
          }}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            mode === value ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const search = (
    <MapSearch
      items={items}
      showCity={showCity}
      activeQuery={filters.query}
      onPick={handlePick}
      onClearQuery={() => setFilters({ ...filters, query: '' })}
    />
  );

  const legend = (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-on-surface-variant" aria-label="Map legend">
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PALETTES[theme].property }} aria-hidden="true" />
        Housing Navigator listing
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PALETTES[theme].propertyOpen }} aria-hidden="true" />
        Accepting applications
      </li>
      {showCity && cityFile && (
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PALETTES[theme].city }} aria-hidden="true" />
          City-financed building
        </li>
      )}
      {view === '3d' && <li>Column height = number of homes</li>}
    </ul>
  );

  const housingPanel = (
    <div className="space-y-5">
      {liveError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Live updates are temporarily unavailable. Showing the most recent verified snapshot.
        </p>
      )}
      <MapStats listings={listingStats} city={cityStats} />
      {cityState === 'loading' && showCity && (
        <p className="text-xs text-on-surface-variant" role="status">Loading City records…</p>
      )}
      {cityState === 'error' && showCity && (
        <p className="text-xs text-on-surface-variant" role="status">City-financed buildings couldn’t load right now. Listings still work.</p>
      )}
      {legend}
      <section className="rounded-2xl border border-surface-container-highest bg-surface-container-low">
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-on-surface"
        >
          Filters and layers
          {hasActiveFilters(filters) && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">On</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4">
            <MapFilters
              filters={filters}
              options={filterOptions}
              showCity={showCity}
              cityAvailable={cityState !== 'error'}
              onChange={setFilters}
              onShowCityChange={setShowCity}
            />
          </div>
        )}
      </section>
      <PlaceList items={inView} colorFor={swatch} selectedKey={selectedKey} onSelect={(item) => selectItem(item)} />
      {listingsOutOfView > 0 && (
        <button
          type="button"
          onClick={() => canvasRef.current?.fitPoints(visibleItems.filter((item) => item.kind === 'listing'), 13)}
          className="w-full rounded-xl border border-dashed border-surface-container-highest px-3 py-2.5 text-sm font-semibold text-primary hover:border-primary/40"
        >
          {listingsOutOfView} more {listingsOutOfView === 1 ? 'listing is' : 'listings are'} outside this view. Show all listings
        </button>
      )}
      {unmapped.length > 0 && (
        <p className="text-xs leading-relaxed text-on-surface-variant">
          Not on the map yet (no confirmed street address):{' '}
          {unmapped.map((listing, index) => (
            <span key={listing.slug}>
              {index > 0 && ', '}
              <Link to={affordablePropertyPath(listing.property)} className="font-semibold text-primary hover:text-primary-dim">
                {listing.property.name}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );

  const dataPanel =
    cityState === 'error' ? (
      <p className="rounded-xl bg-surface-container-low px-4 py-6 text-center text-sm text-on-surface-variant">
        The City’s housing data couldn’t load right now. Try again in a moment.
      </p>
    ) : !cityFile ? (
      <p className="text-sm text-on-surface-variant" role="status">Loading City data…</p>
    ) : (
      <DataPanel breakdowns={breakdowns} totals={dataTotals} focus={focus} focused={focused} onFocus={selectFocus} />
    );

  const panelBody = selectedItem ? (
    <PropertyDetails key={selectedItem.key} item={selectedItem} citySource={citySource} onBack={() => setSelectedKey(null)} />
  ) : mode === 'data' ? (
    dataPanel
  ) : (
    housingPanel
  );

  const sources = (
    <p className="text-[11px] leading-relaxed text-on-surface-variant">
      Listings verified by Housing Navigator. City-financed buildings from the{' '}
      {cityFile ? (
        <a href={cityFile.metadata_url} target="_blank" rel="noreferrer noopener" className="font-semibold hover:text-primary">
          Portland Housing Bureau Rental Portfolio
        </a>
      ) : (
        'Portland Housing Bureau Rental Portfolio'
      )}
      {cityFile ? `, retrieved ${formatDate(cityFile.retrieved_on)}` : ''}. Neighborhoods from City of Portland boundaries. Listing
      locations from the U.S. Census geocoder.
    </p>
  );

  const mapFallback = (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low p-6 lg:pl-[440px]">
      <div className="max-w-sm rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-5 text-center shadow-sm">
        <Building2 className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
        <p className="mt-3 font-headline text-lg font-bold text-on-surface">The map can’t load on this device</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          {mapProblem === 'tiles'
            ? 'Map tiles are unavailable right now.'
            : 'It needs WebGL2, which this browser has turned off or doesn’t support.'}{' '}
          The property list still works, or browse the{' '}
          <Link to="/affordable-housing/" className="font-semibold text-primary hover:text-primary-dim">affordable housing directory</Link>.
        </p>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`relative min-h-0 flex-1 overflow-hidden ${theme === 'night' ? 'bg-[#0b1220]' : 'bg-[#eef2f6]'}`}
    >
      <h1 className="sr-only">Explore Portland affordable housing on a map</h1>

      {webgl && (
        <MapErrorBoundary fallback={mapFallback} onError={() => setMapState('error')}>
          <MapCanvas
            ref={canvasRef}
            theme={theme}
            view={view}
            points={points}
            selectedKey={selectedKey}
            emphasisKeys={emphasisKeys}
            neighborhoods={hoodData}
            neighborhoodsVisible={mode === 'data'}
            neighborhoodFocus={mode === 'data' && focus?.kind === 'neighborhood' ? focus.value : null}
            initialCamera={initialCamera}
            introFrom={introFrom}
            reducedMotion={reducedMotion}
            lowPower={lowPower}
            padding={padding}
            onSelect={(key) => {
              setTour(null);
              selectItem(key ? itemByKey.get(key) ?? null : null);
            }}
            onNeighborhood={focusNeighborhood}
            onViewport={(nextBounds, nextCamera) => {
              setBounds(nextBounds);
              setCamera(nextCamera);
            }}
            onReady={() => setMapState('ready')}
            onError={(kind) => {
              setMapProblem(kind);
              if (kind !== 'tiles' || mapState !== 'ready') setMapState('error');
            }}
          />
        </MapErrorBoundary>
      )}
      {mapState === 'error' && mapFallback}

      {mapState === 'loading' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 overflow-hidden" role="status" aria-label="Loading map">
          <div className="hn-map-loading-bar h-full w-1/3 rounded-full bg-primary" />
        </div>
      )}

      {isDesktop ? (
        <aside
          aria-label="Map panel"
          className="absolute bottom-4 left-4 top-4 z-20 flex flex-col overflow-hidden rounded-3xl border border-surface-container-highest bg-surface-container-lowest/95 shadow-2xl backdrop-blur-xl"
          style={{ width: DESKTOP_PANEL_WIDTH }}
        >
          <div className="space-y-3 border-b border-surface-container-highest px-5 pb-4 pt-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Explore map · Portland</p>
              <p className="mt-1 font-headline text-xl font-bold tracking-tight text-on-surface">
                {mode === 'data' ? 'Affordable housing by the numbers' : 'Affordable housing near you'}
              </p>
            </div>
            {modeTabs}
            {search}
          </div>
          <div data-map-panel-scroll className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{panelBody}</div>
          <div className="border-t border-surface-container-highest px-5 py-3">{sources}</div>
        </aside>
      ) : (
        <>
          <div className="absolute inset-x-3 top-3 z-30 space-y-2">{search}</div>
          <BottomSheet
            snap={sheet}
            onSnap={setSheet}
            label="Map panel"
            header={
              <div className="space-y-2">
                {modeTabs}
                {!selectedItem && mode === 'housing' && (
                  <p className="text-center text-xs text-on-surface-variant" aria-live="polite">
                    {listingStats.properties} {listingStats.properties === 1 ? 'listing' : 'listings'}
                    {cityStats ? ` · ${cityStats.properties} City-financed buildings` : ''} in view
                  </p>
                )}
                {!selectedItem && mode === 'data' && cityFile && (
                  <p className="text-center text-xs text-on-surface-variant">
                    {focused
                      ? `${focused.label}: ${focused.homes.toLocaleString('en-US')} homes highlighted`
                      : `${dataTotals.properties} buildings · ${dataTotals.regulatedHomes.toLocaleString('en-US')} income-restricted homes`}
                  </p>
                )}
              </div>
            }
          >
            <div className="space-y-5 pt-2">
              {panelBody}
              {sources}
            </div>
          </BottomSheet>
        </>
      )}

      {mapState !== 'error' && (isDesktop || controlsRoom >= 110) && (
        <MapControls
          className="absolute right-3 z-10 lg:right-4"
          view={view}
          theme={theme}
          bearing={camera?.bearing ?? 0}
          onView={setView}
          onTheme={setTheme}
          onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
          onNorth={() => canvasRef.current?.resetNorth()}
          onOverview={showOverview}
          onTour={startTour}
          style={{ bottom: isDesktop ? 32 : Math.min(sheetPx, 420) + 12 }}
          compact={!isDesktop && controlsRoom < 240}
          showZoom={isDesktop}
        />
      )}

      {tour && tourStep && (
        <div
          role="dialog"
          aria-label="Guided tour"
          className={`hn-map-rise absolute z-30 rounded-2xl border border-surface-container-highest bg-surface-container-lowest/95 p-4 shadow-2xl backdrop-blur-xl ${
            isDesktop ? 'right-20 top-4 w-[360px]' : 'inset-x-3 top-16'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Tour · {tour.index + 1} of {tour.steps.length}
            </p>
            <button type="button" onClick={() => setTour(null)} aria-label="End tour" className="-m-1 rounded-full p-1 text-on-surface-variant hover:text-on-surface">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 font-headline text-lg font-bold tracking-tight text-on-surface">{tourStep.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant" aria-live="polite">{tourStep.body}</p>
          {tour.playing && !reducedMotion && tour.index < tour.steps.length - 1 && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-container-high">
              <div key={tour.index} className="hn-map-tour-progress h-full rounded-full bg-primary" style={{ ['--hn-tour-ms' as string]: `${TOUR_STEP_MS}ms` }} />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous stop"
              disabled={tour.index === 0}
              onClick={() => setTour({ ...tour, index: tour.index - 1 })}
              className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
            >
              <SkipBack className="h-4 w-4" aria-hidden="true" />
            </button>
            {!reducedMotion && (
              <button
                type="button"
                aria-label={tour.playing ? 'Pause tour' : 'Play tour'}
                onClick={() => setTour({ ...tour, playing: !tour.playing })}
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-low"
              >
                {tour.playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
            <button
              type="button"
              aria-label="Next stop"
              disabled={tour.index >= tour.steps.length - 1}
              onClick={() => setTour({ ...tour, index: tour.index + 1 })}
              className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
            </button>
            {tour.index >= tour.steps.length - 1 && (
              <button type="button" onClick={() => setTour(null)} className="ml-auto text-sm font-semibold text-primary hover:text-primary-dim">
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {mapProblem === 'tiles' && mapState === 'ready' && (
        <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 shadow">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Some map tiles failed to load.
        </div>
      )}
    </div>
  );
}
