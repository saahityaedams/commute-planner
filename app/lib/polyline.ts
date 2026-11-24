import type { LatLon } from "~/core/types";

/** Decode a Google encoded polyline (precision 5 — also what BMTC returns). */
export function decodePolyline(s: string, precision = 1e5): LatLon[] {
  const out: LatLon[] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (let k = 0; k < 2; k++) {
      let b: number, shift = 0, r = 0;
      do {
        b = s.charCodeAt(i++) - 63;
        r |= (b & 31) << shift;
        shift += 5;
      } while (b >= 32 && i < s.length);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      k ? (lon += d) : (lat += d);
    }
    const p: LatLon = [lat / precision, lon / precision];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out;
}
