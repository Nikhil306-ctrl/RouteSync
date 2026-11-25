/**
 * Road routing with an explicit, honest fallback.
 *
 * Primary provider: the public OSRM demo server (driving profile). If it is
 * unreachable, slow or rate limited, callers receive a straight-line
 * "geographic estimate" that is labelled as such in the UI. No road route or
 * live ETA is ever invented.
 */

export const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
export const ESTIMATE_SPEED_KMH = 18;
export const BELAGAVI_CENTER = { latitude: 15.8497, longitude: 74.4977 };

const ROUTE_CACHE_TTL_MS = 5 * 60_000;
const cache = new Map();

function cacheKey(points) {
  return points
    .map((point) => `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`)
    .join(';');
}

export function haversineMeters(a, b) {
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(Number(b.longitude) - Number(a.longitude));
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function geographicPolyline(points) {
  return points.map((point) => [Number(point.latitude), Number(point.longitude)]);
}

export function geographicEstimate(points) {
  const coordinates = geographicPolyline(points);
  let distanceMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    distanceMeters += haversineMeters(points[index - 1], points[index]);
  }
  return {
    provider: 'geographic-estimate',
    fallback: true,
    coordinates,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round((distanceMeters / 1000 / ESTIMATE_SPEED_KMH) * 3600),
  };
}

export function osrmUrl(points) {
  const coordinates = points
    .map((point) => `${Number(point.longitude)},${Number(point.latitude)}`)
    .join(';');
  return `${OSRM_BASE}/${coordinates}?overview=full&geometries=geojson&steps=false`;
}

export function parseOsrmRoute(payload) {
  const route = payload?.routes?.[0];
  const geometry = route?.geometry?.coordinates;
  if (payload?.code !== 'Ok' || !Array.isArray(geometry) || geometry.length < 2) {
    throw new Error('The routing service did not return a usable road route.');
  }
  const coordinates = geometry
    .map((entry) => [Number(entry?.[1]), Number(entry?.[0])])
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
  if (coordinates.length < 2) {
    throw new Error('The routing service returned invalid coordinates.');
  }
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw new Error('The routing service returned invalid distance or duration.');
  }
  return {
    provider: 'osrm',
    fallback: false,
    coordinates,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  };
}

export async function fetchRoadRoute(points, { signal, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const usable = (points ?? []).filter(
    (point) =>
      point &&
      Number.isFinite(Number(point.latitude)) &&
      Number.isFinite(Number(point.longitude)),
  );
  if (usable.length < 2) return null;

  const key = cacheKey(usable);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    if (typeof fetchImpl !== 'function') throw new Error('Routing is unavailable.');
    const response = await fetchImpl(osrmUrl(usable), {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Routing service returned HTTP ${response.status}.`);
    const payload = await response.json();
    const value = parseOsrmRoute(payload);
    cache.set(key, { value, expiresAt: now + ROUTE_CACHE_TTL_MS });
    return value;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      ...geographicEstimate(usable),
      reason: error?.message ?? 'Routing is unavailable.',
    };
  }
}

export function routeSummary(route) {
  if (!route) return null;
  return {
    provider: route.provider,
    fallback: Boolean(route.fallback),
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    label: route.fallback
      ? 'Straight-line estimate · road routing unavailable'
      : 'Road route via OSRM',
  };
}
