import { LngLatBounds, Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Place } from '../services/geocoding.ts';

type Endpoint = 'start' | 'end';

const FLY_DURATION_MS = 1500;
const SINGLE_PLACE_ZOOM = 12;

/** Start/end markers for the current route, plus camera framing. */
export class EndpointMarkers {
  private readonly map: MapLibreMap;
  private readonly markers: Record<Endpoint, Marker | null> = { start: null, end: null };
  private readonly places: Record<Endpoint, Place | null> = { start: null, end: null };

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  update(from: Place | null, to: Place | null): void {
    const startChanged = this.set('start', from);
    const endChanged = this.set('end', to);
    if (startChanged || endChanged) this.frame();
  }

  private set(kind: Endpoint, place: Place | null): boolean {
    if (this.places[kind]?.id === place?.id) return false;
    this.places[kind] = place;

    this.markers[kind]?.remove();
    this.markers[kind] = place
      ? new Marker({ element: createMarkerElement(kind, place), anchor: 'bottom' })
          .setLngLat([place.lon, place.lat])
          .addTo(this.map)
      : null;
    return true;
  }

  private frame(): void {
    const { start, end } = this.places;
    const animate = !prefersReducedMotion();

    if (start && end) {
      const bounds = new LngLatBounds([start.lon, start.lat], [start.lon, start.lat]).extend([end.lon, end.lat]);
      this.map.fitBounds(bounds, {
        padding: framePadding(this.map),
        maxZoom: 14,
        duration: animate ? FLY_DURATION_MS : 0,
      });
      return;
    }

    const single = start ?? end;
    if (!single) return;
    const options = {
      center: [single.lon, single.lat] as [number, number],
      zoom: Math.max(this.map.getZoom(), SINGLE_PLACE_ZOOM),
    };
    if (animate) this.map.flyTo({ ...options, duration: FLY_DURATION_MS });
    else this.map.jumpTo(options);
  }
}

function createMarkerElement(kind: Endpoint, place: Place): HTMLElement {
  // MapLibre positions the outer element via `transform`, so animate an inner pin instead.
  const wrapper = document.createElement('div');
  wrapper.className = `route-marker route-marker--${kind}`;
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', `${kind === 'start' ? 'Start' : 'Cel'}: ${place.label}`);
  wrapper.title = place.label;

  const pin = document.createElement('div');
  pin.className = 'route-marker__pin';
  const label = document.createElement('span');
  label.className = 'route-marker__label';
  label.textContent = kind === 'start' ? 'A' : 'B';

  pin.append(label);
  wrapper.append(pin);
  return wrapper;
}

function framePadding(map: MapLibreMap): number {
  const { clientWidth, clientHeight } = map.getContainer();
  return Math.round(Math.min(90, clientWidth * 0.15, clientHeight * 0.15));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
