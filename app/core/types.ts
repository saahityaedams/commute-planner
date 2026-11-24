/**
 * Core, mode-agnostic primitives. Nothing in app/core knows about BMTC, metro or Bengaluru.
 *
 *   Node       – a point where one mode can be boarded/left (bus stop, metro station, any lat/lon for taxis)
 *   Place      – a named spot with one or more Nodes (e.g. "Mantri" = metro station + bus stop)
 *   Leg        – one continuous movement by one mode
 *   Itinerary  – ordered Legs from a start Node to an end Node
 *   Provider   – something that can route between two Nodes of its mode (BMTC, metro, walk, Namma Yatri…)
 *   Criterion  – a named way to rank itineraries (fastest, cheapest, fewest changes…)
 *   Constraint – a rule an itinerary must satisfy (e.g. "no bus→bus change unless AC")
 *   Preference – a soft rule: a time penalty used for ranking, never for filtering
 */

/** [lat, lon] */
export type LatLon = [number, number];

/** Mode identifiers are open strings so new providers don't touch core. */
export type Mode = string; // "bus" | "metro" | "walk" | "auto" | …

export interface Node {
  mode: Mode;
  /** Provider-specific id (BMTC stop id, metro station code, …). */
  ref: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Place {
  id: string;
  name: string;
  nodes: Node[];
}

export interface Leg {
  mode: Mode;
  /** Short label for chips: route number, line name, "Walk". */
  label: string;
  from: string;
  to: string;
  dep: number; // epoch ms
  arr: number; // epoch ms
  /** INR; null = unknown. 0 = free (walking). */
  fare: number | null;
  /** Optional presentation hints. */
  color?: string;
  live?: boolean;
  detail?: string;
  meters?: number;
  /** Open-ended attributes providers can attach (e.g. "ac", "express", "women-only", "estimate"). */
  tags?: string[];
  /** Geometry for maps: at least [from, to] when known. */
  path?: LatLon[];
  /** Set when the provider's own time was corrected (e.g. by a traffic estimate). */
  adjusted?: { reason: string; deltaMs: number };
}

export interface Itinerary {
  legs: Leg[];
  /** When you must leave the start node (incl. any access time). */
  leave: number;
  /** When you are at the end node (incl. any egress time). */
  arrive: number;
  /** Sum of leg fares; null if any vehicle leg's fare is unknown. */
  fare: number | null;
  /** Vehicle boardings minus one. */
  transfers: number;
  /** e.g. "metro → bus" */
  kind: string;
}

export interface RouteRequest {
  from: Node;
  to: Node;
  /** Earliest time you can board at `from` (already includes access time). */
  departAt: number;
  /**
   * Hint: how many itineraries the planner will keep. Providers whose results are costly may stop there;
   * providers that get everything in one call should return it all — the planner filters, then trims.
   */
  limit: number;
}

export interface Provider {
  id: string;
  mode: Mode;
  /** Street → ready to board (security, stairs, hailing). */
  accessMs: number;
  /** Alight → back on the street. */
  egressMs: number;
  route(req: RouteRequest): Promise<Itinerary[]>;
}

export interface Criterion {
  id: string;
  label: string;
  compare(a: Itinerary, b: Itinerary): number;
}

/**
 * A rule every itinerary must pass. Must be monotone: if part of an itinerary is rejected,
 * any itinerary containing it is rejected too — the planner relies on this to prune early.
 */
export interface Constraint {
  id: string;
  label: string;
  accept(it: Itinerary): boolean;
}

/** A soft rule: extra "felt" time added when ranking (e.g. a long ride on a non-AC bus). */
export interface Preference {
  id: string;
  label: string;
  penaltyMs(it: Itinerary): number;
}
