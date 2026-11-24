// Geometry + walking model (mode-agnostic).

/** Haversine distance in metres */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const WALK_M_PER_MIN = 75; // ~4.5 km/h
const DETOUR = 1.3; // straight-line → street distance
/** Walking time in ms for a straight-line distance in metres. */
export const walkMs = (m: number) => ((m * DETOUR) / WALK_M_PER_MIN) * 60_000;
