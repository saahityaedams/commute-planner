import type { Criterion, Itinerary, Preference } from "./types";

const MIN = 60_000;

/**
 * Long rides on `mode` should carry `tag` (e.g. AC buses for anything but short hops).
 * Each minute of an untagged leg beyond `overMs` "feels" like 1 + `weight` minutes.
 */
export function preferTagOnLongLegs(mode: string, tag: string, opts: { overMs: number; weight?: number; label?: string }): Preference {
  const weight = opts.weight ?? 0.5;
  return {
    id: `prefer-${tag}-${mode}-over-${opts.overMs / MIN}m`,
    label: opts.label ?? `Prefer ${tag.toUpperCase()} ${mode} for rides over ${opts.overMs / MIN} min`,
    penaltyMs: (it) =>
      it.legs.reduce((s, l) => (l.mode === mode && !l.tags?.includes(tag) ? s + Math.max(0, l.arr - l.dep - opts.overMs) * weight : s), 0),
  };
}

export const penaltyMs = (it: Itinerary, prefs: Preference[]) => prefs.reduce((s, p) => s + p.penaltyMs(it), 0);

/** Earliest arrival once preference penalties are added; then fewer changes, then cheaper. */
export function recommended(prefs: Preference[]): Criterion {
  const fare = (it: Itinerary) => it.fare ?? Infinity;
  return {
    id: "recommended",
    label: "Recommended",
    compare: (a, b) => a.arrive + penaltyMs(a, prefs) - (b.arrive + penaltyMs(b, prefs)) || a.transfers - b.transfers || fare(a) - fare(b),
  };
}
