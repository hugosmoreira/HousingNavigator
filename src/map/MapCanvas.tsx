import {
  Component,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';
import type { PaddingOptions } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { HousingMap, MapPoint } from './housingMap';
import type { MapBounds } from './mapData';
import type { MapTheme } from './mapStyle';
import type { CameraState, MapView } from './mapUrlState';

export interface MapCanvasHandle {
  flyTo(target: { lng: number; lat: number; zoom?: number }): void;
  fitPoints(points: Array<{ lng: number; lat: number }>, maxZoom?: number): void;
  zoomBy(delta: number): void;
  resetNorth(): void;
  getCamera(): CameraState | null;
}

interface MapCanvasProps {
  theme: MapTheme;
  view: MapView;
  points: MapPoint[];
  selectedKey: string | null;
  emphasisKeys: string[] | null;
  neighborhoods: FeatureCollection | null;
  neighborhoodsVisible: boolean;
  neighborhoodFocus: string | null;
  initialCamera: CameraState;
  introFrom: CameraState | null;
  reducedMotion: boolean;
  lowPower: boolean;
  padding: () => PaddingOptions;
  onSelect: (key: string | null) => void;
  onNeighborhood: (name: string) => void;
  onViewport: (bounds: MapBounds, camera: CameraState) => void;
  onReady: () => void;
  onError: (kind: 'tiles' | 'webgl' | 'engine') => void;
}

/**
 * Hosts one MapLibre map. The engine is imported on mount, so this
 * component's own chunk stays small and the page UI renders before the map.
 */
const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HousingMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // The view the initial camera was built for; a toggle before the engine
  // loads must still be applied once the map exists.
  const mountedView = useRef(props.view);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (target) => mapRef.current?.flyTo(target),
      fitPoints: (points, maxZoom) => mapRef.current?.fitPoints(points, maxZoom),
      zoomBy: (delta) => mapRef.current?.zoomBy(delta),
      resetNorth: () => mapRef.current?.resetNorth(),
      getCamera: () => mapRef.current?.getCamera() ?? null,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let instance: HousingMap | null = null;
    let observer: ResizeObserver | null = null;

    import('./housingMap')
      .then(({ createHousingMap, GPUInitializationError }) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        const initial = latest.current;
        try {
          instance = createHousingMap({
            container,
            theme: initial.theme,
            view: initial.view,
            camera: initial.initialCamera,
            introFrom: initial.introFrom,
            reducedMotion: initial.reducedMotion,
            lowPower: initial.lowPower,
            padding: () => latest.current.padding(),
            onSelect: (key) => latest.current.onSelect(key),
            onNeighborhood: (name) => latest.current.onNeighborhood(name),
            onViewport: (bounds, camera) => latest.current.onViewport(bounds, camera),
            onReady: () => latest.current.onReady(),
            onError: (kind) => latest.current.onError(kind),
          });
        } catch (error) {
          // MapLibre throws GPUInitializationError when WebGL2 cannot start.
          latest.current.onError(error instanceof GPUInitializationError ? 'webgl' : 'engine');
          return;
        }
        instance.setPoints(initial.points);
        instance.setSelected(initial.selectedKey);
        instance.setEmphasis(initial.emphasisKeys);
        instance.setNeighborhoods(initial.neighborhoods, initial.neighborhoodsVisible, initial.neighborhoodFocus);
        if (initial.view !== mountedView.current) instance.setView(initial.view);
        mapRef.current = instance;
        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(container);
      })
      .catch(() => {
        if (!cancelled) latest.current.onError('engine');
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => mapRef.current?.setPoints(props.points), [props.points]);
  useEffect(() => mapRef.current?.setSelected(props.selectedKey), [props.selectedKey]);
  useEffect(() => mapRef.current?.setEmphasis(props.emphasisKeys), [props.emphasisKeys]);
  useEffect(() => mapRef.current?.setTheme(props.theme), [props.theme]);
  useEffect(
    () => mapRef.current?.setNeighborhoods(props.neighborhoods, props.neighborhoodsVisible, props.neighborhoodFocus),
    [props.neighborhoods, props.neighborhoodsVisible, props.neighborhoodFocus],
  );
  useEffect(() => mapRef.current?.setReducedMotion(props.reducedMotion), [props.reducedMotion]);
  const firstView = useRef(true);
  useEffect(() => {
    // The map is constructed in the initial view; only later changes animate.
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    mapRef.current?.setView(props.view);
  }, [props.view]);

  // MapLibre's stylesheet sets its container to position: relative, so the
  // absolute positioning lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="hn-map h-full w-full"
        role="region"
        aria-label="Interactive map of affordable housing. Use the property list for a keyboard-friendly alternative."
      />
    </div>
  );
});

export default MapCanvas;

interface BoundaryProps {
  fallback: ReactNode;
  onError: () => void;
  children: ReactNode;
}

/** Keeps a map crash (no WebGL, a failed chunk) from blanking the whole site. */
export class MapErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
