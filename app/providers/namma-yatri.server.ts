import { itinerary } from "~/core/itinerary";
import { pointNode } from "~/core/places";
import type { Leg, Node, Provider } from "~/core/types";
import { roughDrive, type Drive } from "~/sources/google.server";

/** A spot you can get an auto to/from (any lat/lon). */
export const autoNode = (name: string, lat: number, lon: number): Node => pointNode("auto", name, lat, lon);

/**
 * Namma Yatri has no public fare API, so this is the tariff as displayed in-app (late 2025 reports):
 * ₹40 for the first 2 km, ₹19/km after, ₹10 pickup fee; 1.5× from 22:00 to 05:00 (the RTA meter is ₹36 + ₹18/km).
 * Treat as an estimate: the app's quote varies with demand.
 */
export const NAMMA_YATRI_AUTO = { baseFare: 40, baseKm: 2, perKm: 19, pickup: 10, nightMultiplier: 1.5 };
export type AutoTariff = typeof NAMMA_YATRI_AUTO;

export function autoFare(meters: number, at: number, t: AutoTariff = NAMMA_YATRI_AUTO): number {
  const km = meters / 1000;
  const metered = t.baseFare + Math.max(0, km - t.baseKm) * t.perKm;
  const istHour = new Date(at + 330 * 60_000).getUTCHours();
  const night = istHour >= 22 || istHour < 5;
  return Math.round(metered * (night ? t.nightMultiplier : 1) + t.pickup);
}

const MIN_RIDE_M = 800; // shorter than this, walk

/** Leg fields for an auto ride of `d` starting at `dep` (shared by search and traffic refinement). */
export function autoLegFields(d: Drive, dep: number, traffic: boolean): Pick<Leg, "fare" | "meters" | "path" | "detail"> {
  return {
    fare: autoFare(d.meters, dep),
    meters: d.meters,
    path: d.path,
    detail: `Namma Yatri · ${(d.meters / 1000).toFixed(1)} km · ${traffic ? "Google traffic" : "rough time, no traffic data"}`,
  };
}

/**
 * Namma Yatri auto. Searches with a free, optimistic drive estimate; the planner's refine step swaps in
 * Google traffic for finalists. Use as a feeder (first/last mile) in the planner.
 */
export const autoProvider: Provider = {
  id: "namma-yatri",
  mode: "auto",
  accessMs: 6 * 60_000, // book + wait for pickup
  egressMs: 0,
  async route({ from, to, departAt }) {
    const d = roughDrive([from.lat, from.lon], [to.lat, to.lon]);
    if (d.meters < MIN_RIDE_M) return [];
    return [
      itinerary([
        {
          mode: "auto",
          label: "Auto",
          from: from.name,
          to: to.name,
          dep: departAt,
          arr: departAt + d.ms,
          color: "#16a34a",
          tags: ["estimate"],
          ...autoLegFields(d, departAt, false),
        },
      ]),
    ];
  },
};
