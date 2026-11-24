import { itinerary } from "./itinerary";
import type { Itinerary, Leg } from "./types";

/**
 * A better estimate for one leg starting at `dep`: its duration, optional field updates (distance, fare,
 * geometry…), and a reason shown when it makes the leg slower. null = keep the leg as is.
 */
export type LegAdjuster = (leg: Leg, dep: number) => Promise<{ durationMs: number; reason?: string; patch?: Partial<Leg> } | null>;

/**
 * Re-time an itinerary with better per-leg estimates (e.g. live traffic). Later legs shift to keep the chain
 * feasible: walks keep their duration, vehicles leave at their scheduled time or as soon as you get there
 * (i.e. we assume the next vehicle is equally late, rather than dropping the option).
 */
export async function retime(it: Itinerary, adjust: LegAdjuster): Promise<Itinerary> {
  const legs: Leg[] = [];
  let prevArr = -Infinity;
  for (const l of it.legs) {
    const dur = l.arr - l.dep;
    const dep = Math.max(l.dep, prevArr);
    const a = await adjust(l, dep);
    const newDur = a?.durationMs ?? dur;
    const slower = newDur - dur;
    legs.push({
      ...l,
      ...a?.patch,
      dep,
      arr: dep + newDur,
      ...(a?.reason && slower > 60_000 ? { adjusted: { reason: a.reason, deltaMs: slower } } : {}),
    });
    prevArr = dep + newDur;
  }
  const last = it.legs[it.legs.length - 1];
  return { ...it, legs, fare: itinerary(legs).fare, arrive: it.arrive + (legs[legs.length - 1].arr - last.arr) };
}
