import { itinerary } from "~/core/itinerary";
import type { Leg, Node, Provider } from "~/core/types";
import { metroFare, planMetro, stationById } from "~/sources/metro.server";

/** Node for a metro station code from app/data/metro.json (e.g. "SPGD"). */
export function metroNode(code: string): Node {
  const s = stationById(code);
  if (!s) throw new Error(`Unknown metro station ${code}`);
  return { mode: "metro", ref: s.id, name: s.name, lat: s.lat, lon: s.lon };
}

const title = (line: string) => line[0] + line.slice(1).toLowerCase();

/** Namma Metro from the bundled BMRCL timetable (handles line changes itself). */
export const metroProvider: Provider = {
  id: "namma-metro",
  mode: "metro",
  accessMs: 4 * 60_000, // street → platform
  egressMs: 2 * 60_000, // platform → street
  async route({ from, to, departAt, limit }) {
    const fare = metroFare(from.ref, to.ref);
    return planMetro(from.ref, to.ref, departAt, limit).map((j) =>
      itinerary(
        j.legs.map<Leg>((l, i) => ({
          mode: "metro",
          label: title(l.line),
          from: l.from,
          to: l.to,
          dep: l.dep,
          arr: l.arr,
          fare: i === 0 ? fare : 0, // one ticket per journey
          color: l.color,
          detail: `towards ${l.headsign} · ${l.stops} stop${l.stops === 1 ? "" : "s"}`,
          path: l.path,
        })),
      ),
    );
  },
};
