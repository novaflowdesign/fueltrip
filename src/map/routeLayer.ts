import { LngLatBounds, type ExpressionSpecification, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';

const SOURCE_ID = 'route';
const CASING_LAYER_ID = 'route-casing';
const LINE_LAYER_ID = 'route-line';

const LINE_COLOR = '#2563eb';
const CASING_COLOR = '#ffffff';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const DRAW_DURATION_MS = 1200;
const FIT_DURATION_MS = 1500;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Single route line drawn on the map with a "live drawing" animation:
 * a `line-gradient` step on `line-progress` reveals the line from start to end.
 */
export class RouteLayer {
  private readonly map: MapLibreMap;
  private readonly ready: Promise<void>;
  private frame: number | null = null;
  /** Bumped on every show/clear so stale async work can bail out. */
  private version = 0;

  constructor(map: MapLibreMap) {
    this.map = map;
    this.ready = new Promise<void>((resolve) => {
      if (map.isStyleLoaded()) resolve();
      else map.once('load', () => resolve());
    }).then(() => this.addLayers());
  }

  async show(geometry: GeoJSON.LineString): Promise<void> {
    const version = ++this.version;
    await this.ready;
    if (version !== this.version) return;

    this.stopAnimation();
    this.source().setData({ type: 'Feature', properties: {}, geometry });
    this.fitTo(geometry);

    if (prefersReducedMotion()) {
      this.setProgress(1);
    } else {
      this.animateDraw();
    }
  }

  clear(): void {
    this.version++;
    this.stopAnimation();
    // Layers only exist once the style is ready; before that there's nothing to clear.
    this.map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(EMPTY);
  }

  private addLayers(): void {
    // `lineMetrics` is required for `line-progress` / `line-gradient`.
    this.map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY, lineMetrics: true });

    // Draw under the first label layer so place names stay readable on top of the route.
    const firstSymbolId = this.map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;

    this.map.addLayer(
      {
        id: CASING_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 6, 12, 10, 16, 16],
          'line-gradient': gradient(CASING_COLOR, 0),
        },
      },
      firstSymbolId,
    );

    this.map.addLayer(
      {
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 12, 6, 16, 10],
          'line-gradient': gradient(LINE_COLOR, 0),
        },
      },
      firstSymbolId,
    );
  }

  private animateDraw(): void {
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / DRAW_DURATION_MS);
      this.setProgress(easeInOutCubic(t));
      this.frame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.setProgress(0);
    this.frame = requestAnimationFrame(tick);
  }

  private stopAnimation(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private setProgress(progress: number): void {
    this.map.setPaintProperty(CASING_LAYER_ID, 'line-gradient', gradient(CASING_COLOR, progress));
    this.map.setPaintProperty(LINE_LAYER_ID, 'line-gradient', gradient(LINE_COLOR, progress));
  }

  private fitTo(geometry: GeoJSON.LineString): void {
    const [first, ...rest] = geometry.coordinates;
    if (!first) return;
    const bounds = rest.reduce(
      (b: LngLatBounds, coord) => b.extend(coord as [number, number]),
      new LngLatBounds(first as [number, number], first as [number, number]),
    );

    const { clientWidth, clientHeight } = this.map.getContainer();
    this.map.fitBounds(bounds, {
      padding: Math.round(Math.min(90, clientWidth * 0.15, clientHeight * 0.15)),
      duration: prefersReducedMotion() ? 0 : FIT_DURATION_MS,
    });
  }

  private source(): GeoJSONSource {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_ID);
    if (!source) throw new Error('Route source missing');
    return source;
  }
}

/** Line colored up to `progress` (0–1), transparent after. */
function gradient(color: string, progress: number): ExpressionSpecification {
  // A stop above 1 means "fully drawn"; a stop at 0 means "nothing drawn yet".
  const stop = progress >= 1 ? 1.01 : Math.max(0, progress);
  return ['step', ['line-progress'], color, stop, TRANSPARENT];
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
