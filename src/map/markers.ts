import { LngLatBounds, Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Place } from '../services/geocoding.ts';
import { centerOffset, framePadding, prefersReducedMotion } from './viewport.ts';

type Endpoint = 'start' | 'end';

const FLY_DURATION_MS = 1500;
const SINGLE_PLACE_ZOOM = 12;

interface RouteMarkers {
  color: string;
  places: Record<Endpoint, Place | null>;
  markers: Record<Endpoint, Marker | null>;
}

/** Start (A) / end (B) markers for every route, in the route's color. */
export class EndpointMarkers {
  private readonly map: MapLibreMap;
  private readonly routes = new Map<string, RouteMarkers>();

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  /**
   * Sync one route's markers. Returns true when an endpoint actually changed
   * (callers use that to move the camera).
   */
  update(id: string, from: Place | null, to: Place | null, color: string): boolean {
    let entry = this.routes.get(id);
    if (!entry) {
      entry = { color, places: { start: null, end: null }, markers: { start: null, end: null } };
      this.routes.set(id, entry);
    }
    const startChanged = this.set(entry, 'start', from, color);
    const endChanged = this.set(entry, 'end', to, color);
    entry.color = color;
    return startChanged || endChanged;
  }

  remove(id: string): void {
    const entry = this.routes.get(id);
    if (!entry) return;
    entry.markers.start?.remove();
    entry.markers.end?.remove();
    this.routes.delete(id);
  }

  /** Remove markers of every route not listed in `keep`. */
  retain(keep: Set<string>): void {
    for (const id of [...this.routes.keys()]) if (!keep.has(id)) this.remove(id);
  }

  /** Dim markers of other routes while one is highlighted. */
  highlight(id: string | null): void {
    for (const [routeId, entry] of this.routes) {
      const dimmed = id !== null && routeId !== id;
      for (const marker of [entry.markers.start, entry.markers.end]) {
        marker?.getElement().classList.toggle('is-dimmed', dimmed);
      }
    }
  }

  /** Move the camera to a route's endpoints (one place → fly to it, two → fit both). */
  frame(id: string): boolean {
    const entry = this.routes.get(id);
    if (!entry) return false;
    const { start, end } = entry.places;
    const animate = !prefersReducedMotion();

    if (start && end) {
      const bounds = new LngLatBounds([start.lon, start.lat], [start.lon, start.lat]).extend([end.lon, end.lat]);
      this.map.fitBounds(bounds, {
        padding: framePadding(this.map),
        maxZoom: 14,
        duration: animate ? FLY_DURATION_MS : 0,
      });
      return true;
    }

    const single = start ?? end;
    if (!single) return false;
    const options = {
      center: [single.lon, single.lat] as [number, number],
      zoom: Math.max(this.map.getZoom(), SINGLE_PLACE_ZOOM),
      // Keep the place centered in the part of the map not covered by the mobile sheet.
      offset: centerOffset(),
    };
    // flyTo with duration 0 (not jumpTo) so the offset is honored with reduced motion too.
    this.map.flyTo({ ...options, duration: animate ? FLY_DURATION_MS : 0 });
    return true;
  }

  private set(entry: RouteMarkers, kind: Endpoint, place: Place | null, color: string): boolean {
    const samePlace = entry.places[kind]?.id === place?.id;
    if (samePlace && entry.color === color) return false;
    entry.places[kind] = place;

    entry.markers[kind]?.remove();
    entry.markers[kind] = place
      ? new Marker({ element: createMarkerElement(kind, place, color), anchor: 'bottom' })
          .setLngLat([place.lon, place.lat])
          .addTo(this.map)
      : null;
    return !samePlace;
  }
}

function createMarkerElement(kind: Endpoint, place: Place, color: string): HTMLElement {
  // MapLibre positions the outer element via `transform`, so animate an inner pin instead.
  const wrapper = document.createElement('div');
  wrapper.className = `route-marker route-marker--${kind}`;
  wrapper.style.setProperty('--pin-color', color);
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', `${kind === 'start' ? 'Start' : 'Cel'}: ${place.label}`);
  wrapper.title = place.label;

  const pin = document.createElement('div');
  pin.className = 'route-marker__pin';

  const label = document.createElement('span');
  label.className = 'route-marker__label';
  label.textContent = kind === 'start' ? 'A' : 'B';

  pin.append(label);

  // One-off ripple under the pin when it appears.
  const pulse = document.createElement('div');
  pulse.className = 'route-marker__pulse';

  wrapper.append(pulse, pin);
  return wrapper;
}

