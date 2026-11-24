/**
 * Driving routes behind a provider-agnostic interface, so OSRM can be swapped
 * for OpenRouteService (or anything else) by implementing `RoutingProvider`.
 */
import type { LngLat } from './geocoding.ts';

export interface RouteResult {
  /** Total driving distance in meters. */
  distanceMeters: number;
  /** Estimated driving time in seconds. */
  durationSeconds: number;
  /** Route shape as [lon, lat] pairs (GeoJSON LineString). */
  geometry: GeoJSON.LineString;
}

export interface RoutingProvider {
  /** Route through `points` in order (start, optional stops, end). */
  getRoute(points: LngLat[], signal?: AbortSignal): Promise<RouteResult>;
}

export type RoutingErrorKind = 'timeout' | 'network' | 'http' | 'no-route';

export class RoutingError extends Error {
  readonly kind: RoutingErrorKind;

  constructor(kind: RoutingErrorKind, message: string) {
    super(message);
    this.name = 'RoutingError';
    this.kind = kind;
  }
}

const TIMEOUT_MS = 10_000;

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
  }>;
}

/** OSRM demo server – free, no key, but no availability guarantee. */
export class OsrmRoutingProvider implements RoutingProvider {
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://router.project-osrm.org') {
    this.baseUrl = baseUrl;
  }

  async getRoute(points: LngLat[], signal?: AbortSignal): Promise<RouteResult> {
    if (points.length < 2) throw new RoutingError('no-route', 'At least two points are required');

    const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    let data: OsrmResponse | undefined;
    try {
      response = await fetch(url, { signal: combined });
      // OSRM returns a JSON body with `code` even on 4xx (e.g. NoRoute → 400).
      data = (await response.json().catch(() => undefined)) as OsrmResponse | undefined;
    } catch (err) {
      if (signal?.aborted) throw err;
      if (timeout.aborted) throw new RoutingError('timeout', 'Routing request timed out');
      throw new RoutingError('network', 'Routing request failed');
    }

    if (data?.code === 'NoRoute' || data?.code === 'NoSegment') {
      throw new RoutingError('no-route', data.message ?? 'No route found');
    }

    const route = data?.routes?.[0];
    if (!response.ok || data?.code !== 'Ok' || !route) {
      throw new RoutingError('http', `Routing failed (HTTP ${response.status}, ${data?.code ?? 'no body'})`);
    }

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
    };
  }
}
