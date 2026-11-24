import { distanceM, walkMs } from "./geo";
import type { Itinerary, Leg, Node } from "./types";

const isVehicle = (l: Leg) => l.mode !== "walk";

/** Build an Itinerary from legs. `leave`/`arrive` default to first dep / last arr, widened by access/egress. */
export function itinerary(legs: Leg[], opts: { accessMs?: number; egressMs?: number } = {}): Itinerary {
  const vehicles = legs.filter(isVehicle);
  const fares = vehicles.map((l) => l.fare);
  const modes: string[] = [];
  for (const l of vehicles) if (modes[modes.length - 1] !== l.mode) modes.push(l.mode);
  return {
    legs,
    leave: legs[0].dep - (opts.accessMs ?? 0),
    arrive: legs[legs.length - 1].arr + (opts.egressMs ?? 0),
    fare: fares.some((f) => f === null) ? null : fares.reduce<number>((s, f) => s + (f ?? 0), 0),
    transfers: Math.max(0, vehicles.length - 1),
    kind: modes.join(" → ") || "walk",
  };
}

/** Merge back-to-back walks (e.g. off a bus, across a transfer place, to the next stop) into one leg. */
export function mergeWalks(legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  for (const l of legs) {
    const prev = out[out.length - 1];
    if (prev?.mode === "walk" && l.mode === "walk") {
      out[out.length - 1] = {
        ...prev,
        to: l.to,
        arr: prev.arr + (l.arr - l.dep),
        meters: (prev.meters ?? 0) + (l.meters ?? 0),
        path: [...(prev.path ?? []), ...(l.path ?? [])],
      };
    } else out.push(l);
  }
  return out;
}

/** Join itineraries end to end; `leave` comes from the first, `arrive` from the last. */
export function chain(parts: Itinerary[]): Itinerary {
  const merged = itinerary(mergeWalks(parts.flatMap((p) => p.legs)));
  return { ...merged, leave: parts[0].leave, arrive: parts[parts.length - 1].arrive };
}

/** A walking leg between two points, starting at `dep`. Returns null for trivially short walks. */
export function walkLeg(from: Pick<Node, "lat" | "lon" | "name">, to: Pick<Node, "lat" | "lon" | "name">, dep: number, minMeters = 0): Leg | null {
  const meters = distanceM(from.lat, from.lon, to.lat, to.lon);
  if (meters < minMeters) return null;
  return {
    mode: "walk", label: "Walk", from: from.name, to: to.name, dep, arr: dep + walkMs(meters), fare: 0, meters,
    path: [[from.lat, from.lon], [to.lat, to.lon]],
  };
}

/** Identity of the physical route taken (ignores departure time), for de-duplication. */
export function signature(it: Itinerary): string {
  return it.legs
    .filter(isVehicle)
    .map((l) => `${l.mode}:${l.label}:${l.from}>${l.to}`)
    .join("|");
}
