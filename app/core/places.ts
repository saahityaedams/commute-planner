import type { Node, Place } from "./types";

/** A Node for modes that can start/stop anywhere (taxi, auto, cycle). */
export const pointNode = (mode: string, name: string, lat: number, lon: number): Node => ({
  mode,
  ref: `${lat.toFixed(5)},${lon.toFixed(5)}`,
  name,
  lat,
  lon,
});

/** Give every place a `mode` point node (at its first node) unless it already has one. */
export const withPointMode = (places: Place[], mode: string): Place[] =>
  places.map((p) =>
    p.nodes.some((n) => n.mode === mode) || !p.nodes.length
      ? p
      : { ...p, nodes: [...p.nodes, pointNode(mode, p.name, p.nodes[0].lat, p.nodes[0].lon)] },
  );
