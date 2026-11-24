/**
 * Namma Metro journey planner over the bundled timetable (app/data/metro.json, built by
 * scripts/build-metro.ts from github.com/Vonter/bmrcl-gtfs — ODbL).
 * Connection Scan Algorithm: earliest arrival, handles interchanges (Majestic, RV Road).
 * Caveat: BMRCL publishes terminal times only; intermediate station times are interpolated.
 */
import raw from "~/data/metro.json";
import { distanceM } from "~/core/geo";

export interface MetroStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
}
export interface MetroLeg {
  line: string;
  color: string;
  headsign: string;
  from: string;
  to: string;
  dep: number; // epoch ms
  arr: number;
  stops: number; // stations travelled (adjacent = 1)
  path: [number, number][]; // station coordinates along the ride
}
export interface MetroJourney {
  legs: MetroLeg[];
  dep: number;
  arr: number;
}

interface Data {
  lines: Record<string, { name: string; color: string }>;
  stations: MetroStation[];
  fares: number[][]; // token/QR INR, same index as stations
  services: { id: string; days: boolean[]; start: string; end: string }[];
  exceptions: Record<string, [number, number][]>;
  patterns: { line: string; headsign: string; stops: string[]; arr: number[]; dep: number[]; trips: [number, number][] }[];
}
const data = raw as unknown as Data;

export const METRO_LINES = data.lines;
export const METRO_STATIONS = data.stations;
const stationIdx = new Map(data.stations.map((s, i) => [s.id, i]));

/** Changing lines (stairs, crowds) takes longer than the feed's 60 s. */
const INTERCHANGE_S = 4 * 60;
const IST_OFFSET_MS = 330 * 60_000;

// conn: [depSec, arrSec, fromIdx, toIdx, tripNo, patternIdx, stopPos]
type Conn = [number, number, number, number, number, number, number];
const cache = new Map<string, Conn[]>();

function istDay(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MS;
  return { ymd, dow, midnight };
}

function activeServices(ymd: string, dow: number): Set<number> {
  const on = new Set<number>();
  data.services.forEach((s, i) => {
    if (s.days[dow] && ymd >= s.start && ymd <= s.end) on.add(i);
  });
  for (const [svc, type] of data.exceptions[ymd] ?? []) type === 1 ? on.add(svc) : on.delete(svc);
  return on;
}

function connectionsFor(ymd: string, dow: number): Conn[] {
  const hit = cache.get(ymd);
  if (hit) return hit;
  const services = activeServices(ymd, dow);
  const conns: Conn[] = [];
  let tripNo = 0;
  data.patterns.forEach((p, pi) => {
    const idx = p.stops.map((id) => stationIdx.get(id) ?? -1);
    for (const [svc, start] of p.trips) {
      if (!services.has(svc)) continue;
      tripNo++;
      for (let k = 0; k < idx.length - 1; k++) {
        if (idx[k] < 0 || idx[k + 1] < 0) continue;
        conns.push([start + p.dep[k], start + p.arr[k + 1], idx[k], idx[k + 1], tripNo, pi, k]);
      }
    }
  });
  conns.sort((a, b) => a[0] - b[0]);
  if (cache.size > 7) cache.clear();
  cache.set(ymd, conns);
  return conns;
}

function scan(conns: Conn[], from: number, to: number, departSec: number, midnight: number): MetroJourney | null {
  const n = data.stations.length;
  const ready = new Array<number>(n).fill(Infinity); // earliest time you can board a *new* train here
  const arrived = new Array<number>(n).fill(Infinity);
  const inConn = new Array<[number, number] | null>(n).fill(null); // [enterConnIdx, exitConnIdx]
  const tripEnter = new Map<number, number>();
  ready[from] = departSec;
  arrived[from] = departSec;

  let lo = 0, hi = conns.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    conns[mid][0] < departSec ? (lo = mid + 1) : (hi = mid);
  }

  for (let i = lo; i < conns.length; i++) {
    const c = conns[i];
    if (c[0] > arrived[to]) break;
    const onTrip = tripEnter.has(c[4]);
    if (!onTrip && ready[c[2]] <= c[0]) tripEnter.set(c[4], i);
    if (!tripEnter.has(c[4])) continue;
    if (c[1] < arrived[c[3]]) {
      arrived[c[3]] = c[1];
      ready[c[3]] = c[1] + INTERCHANGE_S;
      inConn[c[3]] = [tripEnter.get(c[4])!, i];
    }
  }
  if (!Number.isFinite(arrived[to])) return null;

  const legs: MetroLeg[] = [];
  let s = to;
  while (s !== from) {
    const link = inConn[s];
    if (!link) return null;
    const [enter, exit] = link.map((k) => conns[k]);
    const p = data.patterns[enter[5]];
    legs.unshift({
      line: p.line,
      color: data.lines[p.line]?.color ?? "#888",
      headsign: p.headsign,
      from: data.stations[enter[2]].name,
      to: data.stations[exit[3]].name,
      dep: midnight + enter[0] * 1000,
      arr: midnight + exit[1] * 1000,
      stops: exit[6] - enter[6] + 1,
      path: p.stops.slice(enter[6], exit[6] + 2).flatMap((id) => {
        const st = data.stations[stationIdx.get(id) ?? -1];
        return st ? [[st.lat, st.lon] as [number, number]] : [];
      }),
    });
    s = enter[2];
  }
  if (!legs.length) return null;
  return { legs, dep: legs[0].dep, arr: legs[legs.length - 1].arr };
}

/** Next `count` journeys leaving `fromId` at or after `atMs`. */
export function planMetro(fromId: string, toId: string, atMs: number, count = 1): MetroJourney[] {
  const from = stationIdx.get(fromId), to = stationIdx.get(toId);
  if (from === undefined || to === undefined || from === to) return [];
  const { ymd, dow, midnight } = istDay(atMs);
  const conns = connectionsFor(ymd, dow);
  const out: MetroJourney[] = [];
  let t = Math.floor((atMs - midnight) / 1000);
  while (out.length < count) {
    const j = scan(conns, from, to, t, midnight);
    if (!j) break;
    out.push(j);
    t = Math.floor((j.dep - midnight) / 1000) + 1;
  }
  return out;
}

/** Token / QR fare in INR (smart card is ~5% cheaper). */
export function metroFare(fromId: string, toId: string): number | null {
  const i = stationIdx.get(fromId), j = stationIdx.get(toId);
  if (i === undefined || j === undefined) return null;
  return data.fares[i]?.[j] || null;
}

export function stationById(id: string | null | undefined): MetroStation | null {
  const i = id ? stationIdx.get(id) : undefined;
  return i === undefined ? null : data.stations[i];
}

export function nearestStation(lat: number, lon: number, maxM = 1200): { station: MetroStation; distM: number } | null {
  let best: { station: MetroStation; distM: number } | null = null;
  for (const s of data.stations) {
    const d = distanceM(lat, lon, s.lat, s.lon);
    if (d <= maxM && (!best || d < best.distM)) best = { station: s, distM: d };
  }
  return best;
}
