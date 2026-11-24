/**
 * Geocoding / address autocomplete backed by Photon (https://photon.komoot.io).
 * The rest of the app only sees the provider-agnostic `Place` type.
 */

export interface LngLat {
  lon: number;
  lat: number;
}

export interface Place extends LngLat {
  /** Stable id (OSM type + id). */
  id: string;
  /** Main line, e.g. "Rynek Główny 1" or "Gliwice". */
  name: string;
  /** Secondary line, e.g. "Kraków, województwo małopolskie, Polska". */
  context: string;
  /** Full one-line label used in the input after selection. */
  label: string;
}

export interface SearchOptions {
  signal?: AbortSignal;
  /** Prefer results near this point (e.g. current map center). */
  near?: LngLat;
  /** Map zoom for the bias radius – lower zoom = wider, weaker bias. */
  zoom?: number;
  limit?: number;
}

export type GeocodingErrorKind = 'timeout' | 'network' | 'http';

export class GeocodingError extends Error {
  readonly kind: GeocodingErrorKind;

  constructor(kind: GeocodingErrorKind, message: string) {
    super(message);
    this.name = 'GeocodingError';
    this.kind = kind;
  }
}

const PHOTON_URL = 'https://photon.komoot.io/api/';
const TIMEOUT_MS = 8000;
const CACHE_MAX = 50;

interface PhotonProperties {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface PhotonFeature {
  properties: PhotonProperties;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

const cache = new Map<string, Place[]>();

export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<Place[]> {
  const q = query.trim();
  const limit = options.limit ?? 5;

  // `lang=default` → local names ("Kraków", "Polska") instead of following the
  // browser's Accept-Language (an English browser would get "Krakow", "Poland").
  const params = new URLSearchParams({ q, limit: String(limit), lang: 'default' });
  if (options.near) {
    params.set('lat', options.near.lat.toFixed(4));
    params.set('lon', options.near.lon.toFixed(4));
    if (options.zoom !== undefined) params.set('zoom', String(Math.round(options.zoom)));
  }

  const key = params.toString();
  const cached = cache.get(key);
  if (cached) return cached;

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${PHOTON_URL}?${key}`, { signal });
  } catch (err) {
    // Caller cancelled → propagate the AbortError untouched so it can be ignored.
    if (options.signal?.aborted) throw err;
    if (timeout.aborted) throw new GeocodingError('timeout', 'Geocoding request timed out');
    throw new GeocodingError('network', 'Geocoding request failed');
  }

  if (!response.ok) {
    throw new GeocodingError('http', `Geocoding failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as PhotonResponse;
  const places = dedupe((data.features ?? []).map(toPlace));

  cache.set(key, places);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  return places;
}

function toPlace(feature: PhotonFeature): Place {
  const p = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;

  const streetLine = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : undefined;
  const name = p.name ?? streetLine ?? p.city ?? p.county ?? p.state ?? p.country ?? 'Nieznane miejsce';

  const contextParts = [p.name ? streetLine : undefined, p.city ?? p.district ?? p.county, p.state, p.country];
  const context = unique(contextParts.filter((part): part is string => !!part && part !== name)).join(', ');

  return {
    id: `${p.osm_type ?? 'X'}${p.osm_id ?? `${lon},${lat}`}`,
    name,
    context,
    label: context ? `${name}, ${context}` : name,
    lon,
    lat,
  };
}

/** Photon often returns several segments of the same street – keep one per label. */
function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    if (seen.has(place.label)) return false;
    seen.add(place.label);
    return true;
  });
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
