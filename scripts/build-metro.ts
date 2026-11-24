/**
 * Compile the unofficial Namma Metro GTFS (https://github.com/Vonter/bmrcl-gtfs, ODbL)
 * into a compact JSON bundled with the Worker: app/data/metro.json
 *
 *   npm run metro:update               # downloads the latest feed
 *   node scripts/build-metro.ts ./bmrcl.zip
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

const FEED_URL = "https://raw.githubusercontent.com/Vonter/bmrcl-gtfs/main/gtfs/bmrcl.zip";
const OUT = new URL("../app/data/metro.json", import.meta.url);

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ""), r[i] ?? ""])));
}

const secs = (t: string) => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

async function main() {
  const src = process.argv[2];
  const zip = src ? readFileSync(src) : new Uint8Array(await (await fetch(FEED_URL)).arrayBuffer());
  const files = unzipSync(new Uint8Array(zip));
  const table = (n: string) => parseCsv(strFromU8(files[`${n}.txt`]));

  const feed = table("feed_info")[0];
  const routes = table("routes");
  const stops = table("stops");
  const trips = table("trips");
  const stopTimes = table("stop_times");
  const calendar = table("calendar");
  const calendarDates = table("calendar_dates");
  const fareAttrs = new Map(table("fare_attributes").map((f) => [f.fare_id, Number(f.price)]));
  const fareRules = table("fare_rules");

  // Platforms → parent station
  const parentOf = new Map<string, string>();
  const stations = new Map<string, { id: string; name: string; lat: number; lon: number; lines: Set<string> }>();
  for (const s of stops) {
    if (s.location_type === "1") stations.set(s.stop_id, { id: s.stop_id, name: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon, lines: new Set() });
  }
  for (const s of stops) if (s.parent_station) parentOf.set(s.stop_id, s.parent_station);

  const serviceIds = calendar.map((c) => c.service_id);
  const svcIdx = new Map(serviceIds.map((id, i) => [id, i]));
  const tripInfo = new Map(trips.map((t) => [t.trip_id, t]));

  const byTrip = new Map<string, Record<string, string>[]>();
  for (const st of stopTimes) {
    const a = byTrip.get(st.trip_id) ?? [];
    a.push(st);
    byTrip.set(st.trip_id, a);
  }

  type Pattern = { line: string; headsign: string; stops: string[]; arr: number[]; dep: number[]; trips: [number, number][] };
  const patterns = new Map<string, Pattern>();
  for (const [tripId, rows] of byTrip) {
    rows.sort((a, b) => +a.stop_sequence - +b.stop_sequence);
    const t = tripInfo.get(tripId)!;
    const start = secs(rows[0].departure_time);
    const stationIds = rows.map((r) => parentOf.get(r.stop_id) ?? r.stop_id);
    const arr = rows.map((r) => secs(r.arrival_time) - start);
    const dep = rows.map((r) => secs(r.departure_time) - start);
    const key = [t.route_id, stationIds.join(">"), arr.join(","), dep.join(",")].join("|");
    let p = patterns.get(key);
    if (!p) {
      p = { line: t.route_id, headsign: t.trip_headsign, stops: stationIds, arr, dep, trips: [] };
      patterns.set(key, p);
      for (const id of stationIds) stations.get(id)?.lines.add(t.route_id);
    }
    p.trips.push([svcIdx.get(t.service_id)!, start]);
  }
  for (const p of patterns.values()) p.trips.sort((a, b) => a[1] - b[1]);

  // Token / QR fare matrix (INR), indexed by position in out.stations
  const stationList = [...stations.values()].filter((s) => s.lines.size).sort((a, b) => a.name.localeCompare(b.name));
  const pos = new Map(stationList.map((s, i) => [s.id, i]));
  const fares: number[][] = stationList.map(() => stationList.map(() => 0));
  for (const r of fareRules) {
    const i = pos.get(r.origin_id), j = pos.get(r.destination_id), price = fareAttrs.get(r.fare_id);
    if (i !== undefined && j !== undefined && price !== undefined) fares[i][j] = price;
  }

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const out = {
    source: "https://github.com/Vonter/bmrcl-gtfs (ODbL) — derived from BMRCL published timetables",
    feedVersion: feed?.feed_version,
    validFrom: feed?.feed_start_date,
    validTo: feed?.feed_end_date,
    lines: Object.fromEntries(routes.map((r) => [r.route_id, { name: r.route_short_name, color: `#${r.route_color}` }])),
    stations: stationList.map((s) => ({ ...s, lines: [...s.lines] })),
    fares,
    // services[i].days: index 0 = Monday … 6 = Sunday
    services: calendar.map((c) => ({ id: c.service_id, days: days.map((d) => c[d] === "1"), start: c.start_date, end: c.end_date })),
    // date → [serviceIdx, 1 = added | 2 = removed]
    exceptions: calendarDates.reduce<Record<string, [number, number][]>>((acc, d) => {
      (acc[d.date] ??= []).push([svcIdx.get(d.service_id)!, +d.exception_type]);
      return acc;
    }, {}),
    patterns: [...patterns.values()],
  };

  mkdirSync(new URL("../app/data/", import.meta.url), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `metro.json: ${out.stations.length} stations, ${out.patterns.length} patterns, ` +
      `${out.patterns.reduce((s, p) => s + p.trips.length, 0)} trips, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`,
  );
}

main();
