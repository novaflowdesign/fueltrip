import {
  LngLatBounds,
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import { framePadding, prefersReducedMotion } from './viewport.ts';

const CASING_COLOR = '#ffffff';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const DRAW_DURATION_MS = 1200;
const FIT_DURATION_MS = 1500;

const DIMMED_OPACITY = 0.3;

const LINE_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 3.5, 12, 6, 16, 10];
const LINE_WIDTH_ACTIVE: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 6, 12, 9, 16, 14];
const CASING_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 6, 12, 10, 16, 16];
const CASING_WIDTH_ACTIVE: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 9, 12, 14, 16, 20];

interface RouteEntry {
  geometry: GeoJSON.LineString;
  color: string;
  frame: number | null;
  /** Layers exist on the map (style may not have been ready yet when the route arrived). */
  added: boolean;
}

/**
 * One line per route, each in its own color, drawn with a "live drawing"
 * animation (a `line-gradient` step on `line-progress` reveals the line).
 * Each route gets its own source + layers so gradients and highlight work per route.
 */
export class RouteLayers {
  private readonly map: MapLibreMap;
  private readonly routes = new Map<string, RouteEntry>();
  private styleReady = false;
  private highlighted: string | null = null;

  constructor(map: MapLibreMap) {
    this.map = map;
    let firstStyle = true;

    // A new style (theme switch) wipes our sources/layers – re-add them, without re-animating.
    const onStyleLoad = (): void => {
      this.styleReady = true;
      for (const [id, entry] of this.routes) {
        if (entry.frame !== null) cancelAnimationFrame(entry.frame);
        entry.frame = null;
        entry.added = false;
        this.addToMap(id, entry, firstStyle);
      }
      firstStyle = false;
      this.applyHighlight();
    };
    map.on('style.load', onStyleLoad);
    map.on('styledataloading', () => {
      this.styleReady = false;
    });
    if (map.isStyleLoaded()) onStyleLoad();
  }

  /** Show (or replace) a route's line. Same geometry object → no-op (no re-animation). */
  set(id: string, geometry: GeoJSON.LineString | null, color: string): void {
    const existing = this.routes.get(id);
    if (!geometry) {
      if (existing) this.remove(id);
      return;
    }
    if (existing && existing.geometry === geometry && existing.color === color) return;

    if (existing) this.removeFromMap(id, existing);
    const entry: RouteEntry = { geometry, color, frame: null, added: false };
    this.routes.set(id, entry);
    if (this.styleReady) {
      this.addToMap(id, entry, true);
      this.applyHighlight();
    }
  }

  remove(id: string): void {
    const entry = this.routes.get(id);
    if (!entry) return;
    this.removeFromMap(id, entry);
    this.routes.delete(id);
  }

  /** Remove every route not listed in `keep`. */
  retain(keep: Set<string>): void {
    for (const id of [...this.routes.keys()]) if (!keep.has(id)) this.remove(id);
  }

  has(id: string): boolean {
    return this.routes.has(id);
  }

  /** Emphasize one route (thicker, on top) and dim the others; `null` = all equal. */
  highlight(id: string | null): void {
    if (this.highlighted === id) return;
    this.highlighted = id;
    this.applyHighlight();
  }

  /** Fit the camera to the given routes (all routes when omitted). Returns false if nothing to fit. */
  fit(ids?: string[]): boolean {
    const entries = (ids ?? [...this.routes.keys()])
      .map((id) => this.routes.get(id))
      .filter((e): e is RouteEntry => !!e);

    let bounds: LngLatBounds | null = null;
    for (const { geometry } of entries) {
      for (const coord of geometry.coordinates) {
        const point = coord as [number, number];
        bounds = bounds ? bounds.extend(point) : new LngLatBounds(point, point);
      }
    }
    if (!bounds) return false;

    this.map.fitBounds(bounds, {
      padding: framePadding(this.map),
      duration: prefersReducedMotion() ? 0 : FIT_DURATION_MS,
    });
    return true;
  }

  // ---------- internals ----------

  private addToMap(id: string, entry: RouteEntry, animate: boolean): void {
    if (entry.added) return;
    const { source, casing, line } = layerIds(id);

    // `lineMetrics` is required for `line-progress` / `line-gradient`.
    this.map.addSource(source, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: entry.geometry },
      lineMetrics: true,
    });

    const beforeId = this.firstSymbolLayerId();
    const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
    this.map.addLayer(
      {
        id: casing,
        type: 'line',
        source,
        layout,
        paint: { 'line-width': CASING_WIDTH, 'line-gradient': gradient(CASING_COLOR, 0) },
      },
      beforeId,
    );
    this.map.addLayer(
      {
        id: line,
        type: 'line',
        source,
        layout,
        paint: { 'line-width': LINE_WIDTH, 'line-gradient': gradient(entry.color, 0) },
      },
      beforeId,
    );
    entry.added = true;

    if (animate && !prefersReducedMotion()) this.animateDraw(id, entry);
    else this.setProgress(id, entry, 1);
  }

  private removeFromMap(id: string, entry: RouteEntry): void {
    if (entry.frame !== null) cancelAnimationFrame(entry.frame);
    entry.frame = null;
    if (!entry.added) return;
    const { source, casing, line } = layerIds(id);
    if (this.map.getLayer(line)) this.map.removeLayer(line);
    if (this.map.getLayer(casing)) this.map.removeLayer(casing);
    if (this.map.getSource<GeoJSONSource>(source)) this.map.removeSource(source);
    entry.added = false;
  }

  private animateDraw(id: string, entry: RouteEntry): void {
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / DRAW_DURATION_MS);
      this.setProgress(id, entry, easeInOutCubic(t));
      entry.frame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.setProgress(id, entry, 0);
    entry.frame = requestAnimationFrame(tick);
  }

  private setProgress(id: string, entry: RouteEntry, progress: number): void {
    if (!entry.added) return;
    const { casing, line } = layerIds(id);
    this.map.setPaintProperty(casing, 'line-gradient', gradient(CASING_COLOR, progress));
    this.map.setPaintProperty(line, 'line-gradient', gradient(entry.color, progress));
  }

  private applyHighlight(): void {
    if (!this.styleReady) return;
    const active = this.highlighted && this.routes.has(this.highlighted) ? this.highlighted : null;

    for (const [id, entry] of this.routes) {
      if (!entry.added) continue;
      const { casing, line } = layerIds(id);
      const isActive = id === active;
      const opacity = active && !isActive ? DIMMED_OPACITY : 1;
      this.map.setPaintProperty(line, 'line-opacity', opacity);
      this.map.setPaintProperty(casing, 'line-opacity', opacity);
      this.map.setPaintProperty(line, 'line-width', isActive ? LINE_WIDTH_ACTIVE : LINE_WIDTH);
      this.map.setPaintProperty(casing, 'line-width', isActive ? CASING_WIDTH_ACTIVE : CASING_WIDTH);
    }

    // Bring the highlighted route above the others (still under the labels).
    if (active) {
      const { casing, line } = layerIds(active);
      const beforeId = this.firstSymbolLayerId();
      this.map.moveLayer(casing, beforeId);
      this.map.moveLayer(line, beforeId);
    }
  }

  /**
   * Insert routes right before the trailing block of label layers: above roads,
   * bridges and borders, but under place names. (Styles differ – Liberty has a few
   * symbol layers early on, the dark style even before its roads.)
   */
  private firstSymbolLayerId(): string | undefined {
    const layers = this.map.getStyle().layers;
    let lastNonSymbol = -1;
    layers.forEach((layer, i) => {
      if (layer.type !== 'symbol' && !layer.id.startsWith('route-')) lastNonSymbol = i;
    });
    return layers.slice(lastNonSymbol + 1).find((layer) => !layer.id.startsWith('route-'))?.id;
  }
}

function layerIds(id: string): { source: string; casing: string; line: string } {
  return { source: `route-${id}`, casing: `route-${id}-casing`, line: `route-${id}-line` };
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

