/**
 * Traffic-aware driving time via the Google Maps Routes API (computeRoutes, TRAFFIC_AWARE).
 * Key: GOOGLE_MAPS_API_KEY (.dev.vars locally, `wrangler secret put` in prod).
 *
 * Only finalists are looked up (see app.server.ts), and cost is bounded three ways:
 *  - results are cached in the GoogleRoutesState Durable Object by (from, to rounded to ~100 m,
 *    weekday/weekend, 30-min slot of day) for 7 days — traffic patterns repeat week to week;
 *  - at most BUDGET calls per page load;
 *  - a durable monthly counter stops at MONTHLY_LIMIT, under Google's 5,000/month free allowance for
 *    Compute Routes Pro (TRAFFIC_AWARE). Past it, callers get null and keep their rough estimates.
 */
import { env } from "cloudflare:workers";
import { distanceM } from "~/core/geo";
import type { LatLon } from "~/core/types";
import { decodePolyline } from "~/lib/polyline";

export interface Drive {
  ms: number;
  meters: number;
  path: LatLon[];
}
/** null = no traffic data available (no key, over budget/cap, or Google failed). */
export type TrafficDrive = (from: LatLon, to: LatLon, at: number) => Promise<Drive | null>;

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const IST_OFFSET_MS = 330 * 60_000;
const SLOT_MS = 30 * 60_000;
const CACHE_TTL_MS = 7 * 86_400_000;
const BUDGET = 25;
export const MONTHLY_LIMIT = 4500;

/**
 * No-cost, deliberately optimistic driving estimate (straight line × 1.3 at 22 km/h) used while searching.
 * Optimistic so that the traffic lookup on finalists only ever slows a route down.
 */
export function roughDrive(from: LatLon, to: LatLon): Drive {
  const meters = distanceM(from[0], from[1], to[0], to[1]) * 1.3;
  return { ms: (meters / 22_000) * 3600_000, meters, path: [from, to] };
}

const istMonth = (ms = Date.now()) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 7); // "2026-11"
const state = () => env.GOOGLE_ROUTES.get(env.GOOGLE_ROUTES.idFromName("global"));

/** Google Routes calls made this (IST) month. */
export const googleCallsThisMonth = () => state().used(istMonth());

function cacheKey(from: LatLon, to: LatLon, at: number): string {
  const ist = new Date(at + IST_OFFSET_MS);
  const dayType = ist.getUTCDay() % 6 === 0 ? "we" : "wd";
  const slot = Math.floor(((at + IST_OFFSET_MS) % 86_400_000) / SLOT_MS);
  const r = (x: number) => x.toFixed(3);
  return `${r(from[0])},${r(from[1])}>${r(to[0])},${r(to[1])}@${dayType}${slot}`;
}

async function google(key: string, from: LatLon, to: LatLon, at: number): Promise<Drive> {
  const ll = ([latitude, longitude]: LatLon) => ({ location: { latLng: { latitude, longitude } } });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: ll(from),
      destination: ll(to),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      // Must not be in the past; future times use Google's predicted traffic.
      departureTime: new Date(Math.max(at, Date.now() + 60_000)).toISOString(),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google Routes HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { routes?: { duration: string; distanceMeters: number; polyline?: { encodedPolyline: string } }[] };
  const r = data.routes?.[0];
  if (!r) throw new Error("Google Routes: no route");
  return { ms: parseFloat(r.duration) * 1000, meters: r.distanceMeters, path: r.polyline ? decodePolyline(r.polyline.encodedPolyline) : [from, to] };
}

/** Create one per request: it holds the in-flight memo and the per-request budget. */
export function createTrafficDrive(onNote?: (msg: string) => void): TrafficDrive {
  const key = env.GOOGLE_MAPS_API_KEY || undefined;
  const inflight = new Map<string, Promise<Drive | null>>();
  let calls = 0;
  const noted = new Set<string>();
  const note = (k: string, msg: string) => {
    if (!noted.has(k)) onNote?.(msg);
    noted.add(k);
  };

  return (from, to, at) => {
    const k = cacheKey(from, to, at);
    let hit = inflight.get(k);
    if (hit) return hit;
    hit = (async () => {
      if (!key) return null;
      const s = state();
      const cached = (await s.cacheGet(k).catch(() => null)) as unknown as Drive | null;
      if (cached) return cached;
      if (calls >= BUDGET) return note("budget", "traffic: per-plan lookup budget used up; some legs uncorrected"), null;
      calls++;
      if (!(await s.take(istMonth(), MONTHLY_LIMIT))) return note("cap", `traffic: monthly free-tier cap (${MONTHLY_LIMIT}) reached`), null;
      try {
        const d = await google(key, from, to, at);
        await s.cachePut(k, { ...d }, CACHE_TTL_MS).catch(() => {});
        return d;
      } catch (e) {
        note("err", `traffic: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    })();
    inflight.set(k, hit);
    return hit;
  };
}
