/**
 * Composition root: which providers, places, rules and rankings this app uses.
 * Add a provider here and it participates in every plan.
 */
import { plan as corePlan, type PlanOptions } from "~/core/planner";
import { cheapest, fastest, fewestChanges } from "~/core/criteria";
import { noSameModeChange } from "~/core/constraints";
import { distrustCorrections, fewerChanges, preferTagOnLongLegs, recommended } from "~/core/preferences";
import { withPointMode } from "~/core/places";
import { retime, type LegAdjuster } from "~/core/retime";
import type { Itinerary, Place, Preference } from "~/core/types";
import { PLACES as MY_PLACES } from "~/config/places.server";
import { AC_ROUTES } from "~/config/buses.server";
import { createBmtcProvider } from "~/providers/bmtc.server";
import { metroNode, metroProvider } from "~/providers/metro.server";
import { autoLegFields, autoNode, autoProvider } from "~/providers/namma-yatri.server";
import { createTrafficDrive, type TrafficDrive } from "~/sources/google.server";
import { METRO_STATIONS } from "~/sources/metro.server";

/** Your places, each also an auto pickup/drop point. These are what you can plan between. */
export const PLACES: Place[] = withPointMode(MY_PLACES, "auto");
export const placeById = (id: string | null | undefined) => PLACES.find((p) => p.id === id) ?? null;

/** Every metro station is also a transfer point between an auto (first/last mile) and the metro. */
const mine = new Set(MY_PLACES.flatMap((p) => p.nodes.filter((n) => n.mode === "metro").map((n) => n.ref)));
const STATION_PLACES: Place[] = METRO_STATIONS.filter((s) => !mine.has(s.id)).map((s) => ({
  id: `metro-${s.id}`,
  name: `${s.name} metro`,
  nodes: [metroNode(s.id), autoNode(`${s.name} metro`, s.lat, s.lon)],
}));

/** Autos are for the first/last mile only: at the ends of a transit trip, rides up to ~5 km straight line. */
export const AUTO_RADIUS_M = 5000;

/**
 * A bus can't beat a car in the same traffic: its leg takes at least the traffic-aware drive time,
 * scaled to the bus's own (often longer) route distance, × BUS_VS_CAR for stops and lumbering.
 */
export const BUS_VS_CAR = 1.2;
/** Traffic-checked finalists per plan (each costs ~1–3 Google lookups, most of them cached). */
export const FINALISTS = 8;

const withTraffic = (drive: TrafficDrive): LegAdjuster => async (leg, dep) => {
  const path = leg.path;
  if (!path || path.length < 2) return null;
  if (leg.mode === "bus") {
    const d = await drive(path[0], path[path.length - 1], dep);
    if (!d) return null;
    const routeRatio = leg.meters && d.meters ? Math.max(1, leg.meters / d.meters) : 1;
    const floor = d.ms * routeRatio * BUS_VS_CAR;
    return floor > leg.arr - leg.dep ? { durationMs: floor, reason: "traffic" } : null;
  }
  if (leg.mode === "auto") {
    const d = await drive(path[0], path[path.length - 1], dep);
    return d && { durationMs: d.ms, reason: "traffic", patch: autoLegFields(d, dep, true) };
  }
  return null; // metro runs to timetable; walks don't care about traffic
};

/** Ordinary buses are fine for short hops; for longer rides an AC bus (Vajra V-…, Vayu Vajra KIA-…, or AC_ROUTES). */
export const preferAc = preferTagOnLongLegs("bus", "ac", { overMs: 20 * 60_000, weight: 0.5, label: "Prefer AC buses for rides over 20 min" });

export const preferences: Preference[] = [
  preferAc,
  // A single bus all the way is pleasant; each change is a small hassle.
  fewerChanges(5 * 60_000, "Each change counts as 5 extra minutes, so one bus all the way wins a close call"),
  // Road time is a gamble, the metro isn't: minutes added for traffic count 1.5×.
  distrustCorrections(0.5, "Minutes added for traffic count 1.5×, because the road is unpredictable and the metro isn't"),
];

export const planOptions: Omit<PlanOptions, "providers" | "refine"> = {
  transferPlaces: [...PLACES, ...STATION_PLACES],
  criteria: [recommended(preferences), fastest, cheapest, fewestChanges],
  // Hard rules. Bus↔metro changes are fine; bus→bus only if both buses are AC.
  constraints: [noSameModeChange("bus", "ac")],
  // Up to three legs of transit (AC bus → metro → bus), but the third only as a short hop near the destination.
  maxSegments: 3,
  extraSegmentRadiusM: 5000,
  feeders: [autoProvider.id],
  feederRadiusM: AUTO_RADIUS_M,
  perHop: 3,
  perFinalHop: 3,
};

export async function plan(from: Place, to: Place, departAt: number) {
  const notes: string[] = [];
  // Fresh per request: BMTC's concurrency gate and the traffic budget must not leak across requests.
  const traffic = withTraffic(createTrafficDrive((m) => notes.push(m)));
  const result = await corePlan(from, to, departAt, {
    ...planOptions,
    providers: [metroProvider, createBmtcProvider({ acRoutes: AC_ROUTES }), autoProvider],
    refine: { top: FINALISTS, fn: (it: Itinerary) => retime(it, traffic) },
  });
  return { ...result, errors: [...result.errors, ...notes] };
}
