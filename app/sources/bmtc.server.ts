/**
 * Typed client for the API behind https://nammabmtcapp.karnataka.gov.in (Angular dashboard).
 * Base URL and endpoint names were taken from the dashboard's main.js bundle.
 * Server-only: the API's CORS only allows the official site, so call it from loaders/actions.
 */
import { distanceM, walkMs } from "~/core/geo";
import { parseBmtcTime, toBmtcDateTime } from "~/lib/time";
import type { Stop } from "~/lib/stops";
import { decodePolyline } from "~/lib/polyline";
import type { LatLon } from "~/core/types";

const BASE = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/";

const HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  lan: "en",
  deviceType: "WEB",
  Origin: "https://nammabmtcapp.karnataka.gov.in",
  Referer: "https://nammabmtcapp.karnataka.gov.in/",
  // Without a browser-like UA the API answers 200 with an empty body.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

interface Envelope<T> {
  data: T;
  Message: string;
  Issuccess: boolean;
  responsecode: number;
}

// The API is flaky under bursts: intermittent 404s, 5xx, empty bodies and hangs on requests that succeed
// moments later. So: cap concurrency, time out slow calls, retry transient failures with backoff.
const MAX_IN_FLIGHT = 6;
const TIMEOUT_MS = 12_000;
const RETRIES = 2; // → up to 3 attempts
const RETRYABLE = new Set([404, 408, 425, 429, 500, 502, 503, 504]);

/**
 * A concurrency gate. Must be created per request: Workers forbid resolving a promise from another
 * request's context, so a module-level queue makes one request wait forever on another's slot release.
 */
export type Gate = <T>(fn: () => Promise<T>) => Promise<T>;
export function createGate(max = MAX_IN_FLIGHT): Gate {
  let inFlight = 0;
  const waiters: (() => void)[] = [];
  return async (fn) => {
    while (inFlight >= max) await new Promise<void>((r) => waiters.push(r));
    inFlight++;
    try {
      return await fn();
    } finally {
      inFlight--;
      waiters.shift()?.();
    }
  };
}

class BmtcError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function once<T>(endpoint: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + endpoint, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new BmtcError(`BMTC ${endpoint}: ${e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error"}`, true);
  }
  const text = await res.text();
  if (!res.ok) throw new BmtcError(`BMTC ${endpoint}: HTTP ${res.status}`, RETRYABLE.has(res.status));
  if (!text) throw new BmtcError(`BMTC ${endpoint}: empty response`, true);
  return (JSON.parse(text) as Envelope<T>).data;
}

export async function bmtc<T>(endpoint: string, body: unknown, gate: Gate = createGate()): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await gate(() => once<T>(endpoint, body));
    } catch (e) {
      if (!(e instanceof BmtcError) || !e.retryable || attempt >= RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt + Math.random() * 200));
    }
  }
}

// ---------- Stop search ----------

interface RawStop {
  routeid: number;
  routename: string;
  center_lat: number;
  center_lon: number;
}

export async function searchStops(q: string): Promise<Stop[]> {
  if (q.trim().length < 3) return [];
  const data = await bmtc<RawStop[] | null>("FindNearByBusStop_v2", { stationName: q.trim() });
  return (data ?? []).map((s) => ({
    id: s.routeid,
    name: s.routename,
    lat: Number(s.center_lat),
    lon: Number(s.center_lon),
  }));
}

// ---------- Trip planner ----------

interface RawLeg {
  routeno: string;
  routeid: number;
  tripId: number;
  vehicleId: number;
  busNo: string;
  fromStationName: string;
  toStationName: string;
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  etaFromStation: string; // "MM/DD/YYYY HH:mm:ss" IST
  etaToStation: string;
  approx_fare: number;
  distance: number; // metres along the route
  polyline: string | null; // Google-encoded, precision 5
  devicestatusflag: number;
  platformnumber: string;
}

export interface Leg {
  route: string;
  from: string;
  to: string;
  board: number; // epoch ms
  alight: number;
  live: boolean; // a tracked vehicle is assigned
  busNo: string | null;
  fare: number | null; // approx fare for this leg, INR
  meters: number | null; // distance along the route
  path: LatLon[]; // route geometry (at least board → alight)
}

export interface Journey {
  legs: Leg[];
  walkToBoardM: number;
  walkFromAlightM: number;
  leaveBy: number; // when you must leave the origin point
  arrive: number; // at the destination point, incl. final walk
  fare: number;
}

export interface BusPlan {
  journeys: Journey[]; // feasible from readyAt, sorted by arrival
  error?: string;
}

function toLeg(l: RawLeg): Leg {
  return {
    route: l.routeno,
    from: l.fromStationName,
    to: l.toStationName,
    board: parseBmtcTime(l.etaFromStation),
    alight: parseBmtcTime(l.etaToStation),
    live: l.vehicleId > 0,
    busNo: l.busNo && l.busNo !== "N/A" ? l.busNo : null,
    fare: l.approx_fare > 0 ? l.approx_fare : null,
    meters: l.distance > 0 ? l.distance : null,
    path: (() => {
      const ends: LatLon[] = [[l.fromLatitude, l.fromLongitude], [l.toLatitude, l.toLongitude]];
      if (!l.polyline) return ends;
      const p = decodePolyline(l.polyline);
      return p.length > 1 ? p : ends;
    })(),
  };
}

/** Bus journeys from `origin` (you're standing there at `readyAt`) to `dest`. */
export async function planBus(origin: Stop, dest: Stop, readyAt: number, gate: Gate = createGate()): Promise<BusPlan> {
  const plan: BusPlan = { journeys: [] };
  try {
    // The dashboard's "Sort by" toggle: 1 tends to favour fewer transfers (single-seat buses),
    // 2 favours shortest scheduled time (often multi-bus chains). Ask for both and merge.
    type Resp = { directRoutes: RawLeg[] | RawLeg[][]; transferRoutes: RawLeg[][] } | null;
    const query = (filterBy: number) =>
      bmtc<Resp>("TripPlannerMSMD_OTP", {
        fromStationId: origin.id,
        fromLatitude: origin.lat,
        fromLongitude: origin.lon,
        toStationId: dest.id,
        toLatitude: dest.lat,
        toLongitude: dest.lon,
        filterBy,
        serviceTypeId: null,
        fromDateTime: toBmtcDateTime(readyAt),
        lan: "en",
      }, gate);
    const responses = await Promise.allSettled([query(1), query(2)]);
    const ok = responses.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (!ok.length) throw (responses[0] as PromiseRejectedResult).reason;

    const seen = new Set<string>();
    const paths: RawLeg[][] = ok
      .flatMap((data) => [
        ...(data?.directRoutes ?? []).map((p) => (Array.isArray(p) ? p : [p])),
        ...(data?.transferRoutes ?? []),
      ])
      .filter((p) => {
        if (!p.length) return false;
        const key = p.map((l) => `${l.tripId}:${l.fromStationName}>${l.toStationName}`).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    for (const raw of paths) {
      const first = raw[0];
      const last = raw[raw.length - 1];
      const walkToBoardM = distanceM(origin.lat, origin.lon, first.fromLatitude, first.fromLongitude);
      const walkFromAlightM = distanceM(last.toLatitude, last.toLongitude, dest.lat, dest.lon);
      const legs = raw.map(toLeg);
      const leaveBy = legs[0].board - walkMs(walkToBoardM);
      if (leaveBy < readyAt - 60_000) continue; // can't make this bus
      plan.journeys.push({
        legs,
        walkToBoardM,
        walkFromAlightM,
        leaveBy,
        arrive: legs[legs.length - 1].alight + walkMs(walkFromAlightM),
        fare: raw.reduce((s, l) => s + (l.approx_fare || 0), 0),
      });
    }
    plan.journeys.sort((a, b) => a.arrive - b.arrive || a.legs.length - b.legs.length);
  } catch (e) {
    plan.error = e instanceof Error ? e.message : String(e);
  }
  return plan;
}
