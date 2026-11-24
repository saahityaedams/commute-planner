import type { Constraint, Leg } from "./types";

const vehicleLegs = (legs: Leg[]) => legs.filter((l) => l.mode !== "walk");

/**
 * Disallow changing from one `mode` vehicle to another of the same mode (walks in between don't count),
 * unless both legs carry `unlessTag`. e.g. noSameModeChange("bus", "ac"): bus→bus only between AC buses.
 */
export function noSameModeChange(mode: string, unlessTag?: string): Constraint {
  const exempt = (l: Leg) => !!unlessTag && !!l.tags?.includes(unlessTag);
  return {
    id: `no-${mode}-change${unlessTag ? `-unless-${unlessTag}` : ""}`,
    label: `No ${mode} → ${mode} changes${unlessTag ? ` unless both are ${unlessTag.toUpperCase()}` : ""}`,
    accept(it) {
      const v = vehicleLegs(it.legs);
      for (let i = 1; i < v.length; i++) {
        if (v[i - 1].mode === mode && v[i].mode === mode && !(exempt(v[i - 1]) && exempt(v[i]))) return false;
      }
      return true;
    },
  };
}

/** Cap the number of vehicle changes. */
export function maxTransfers(n: number): Constraint {
  return { id: `max-transfers-${n}`, label: `At most ${n} change${n === 1 ? "" : "s"}`, accept: (it) => it.transfers <= n };
}

/** Require at least `minMs` between arriving on one vehicle and departing on the next. */
export function minConnection(minMs: number): Constraint {
  return {
    id: `min-connection-${minMs}`,
    label: `At least ${Math.round(minMs / 60_000)} min to make each connection`,
    accept(it) {
      const v = vehicleLegs(it.legs);
      for (let i = 1; i < v.length; i++) if (v[i].dep - v[i - 1].arr < minMs) return false;
      return true;
    },
  };
}
