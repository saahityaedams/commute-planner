import { itinerary } from "~/core/itinerary";
import type { Leg, Node, Provider } from "~/core/types";
import { createGate, planBus } from "~/sources/bmtc.server";
import type { Stop } from "~/lib/stops";

const SHOW_WALK_OVER_M = 150;
/**
 * BMTC doesn't flag AC per leg (serviceTypeId is always 0); Vajra ("V-500CA", "V-285M"…) and Vayu Vajra
 * airport ("KIA-8"…) routes are the AC fleet.
 */
const AC_ROUTE = /^(V-|KIA-)/i;

export const busNode = (s: Stop): Node => ({ mode: "bus", ref: String(s.id), name: s.name, lat: s.lat, lon: s.lon });
const toStop = (n: Node): Stop => ({ id: Number(n.ref), name: n.name, lat: n.lat, lon: n.lon });

/**
 * BMTC buses via the official trip planner (handles bus↔bus transfers itself).
 * Create one per request: it owns a concurrency gate that must not be shared across requests.
 */
/** Reuse one planner answer for every request in the same window (it lists all departures after the window start). */
const WINDOW_MS = 10 * 60_000;

export const createBmtcProvider = (): Provider => {
  const gate = createGate();
  const windows = new Map<string, ReturnType<typeof planBus>>();
  return {
    id: "bmtc",
    mode: "bus",
    accessMs: 0,
    egressMs: 0,
    // One API call returns every option, so ignore `limit` and let the planner filter before trimming.
    async route({ from, to, departAt }) {
      const start = Math.floor(departAt / WINDOW_MS) * WINDOW_MS;
      const key = `${from.ref}>${to.ref}@${start}`;
      if (!windows.has(key)) windows.set(key, planBus(toStop(from), toStop(to), start, gate));
      const plan = await windows.get(key)!;
      if (plan.error && !plan.journeys.length) throw new Error(plan.error);
      return plan.journeys.map((j) => {
        const legs: Leg[] = [];
        const first = j.legs[0];
        const last = j.legs[j.legs.length - 1];
        if (j.walkToBoardM > SHOW_WALK_OVER_M)
          legs.push({ mode: "walk", label: "Walk", from: from.name, to: first.from, dep: j.leaveBy, arr: first.board, fare: 0, meters: j.walkToBoardM, path: [[from.lat, from.lon], first.path[0]] });
        for (const l of j.legs)
          legs.push({
            mode: "bus", label: l.route, from: l.from, to: l.to, dep: l.board, arr: l.alight, fare: l.fare, live: l.live,
            detail: l.busNo ?? undefined, tags: AC_ROUTE.test(l.route) ? ["ac"] : [], path: l.path, meters: l.meters ?? undefined,
          });
        if (j.walkFromAlightM > SHOW_WALK_OVER_M)
          legs.push({ mode: "walk", label: "Walk", from: last.to, to: to.name, dep: last.alight, arr: j.arrive, fare: 0, meters: j.walkFromAlightM, path: [last.path[last.path.length - 1], [to.lat, to.lon]] });
        return { ...itinerary(legs), leave: j.leaveBy, arrive: j.arrive };
      }).filter((it) => it.leave >= departAt - 60_000);
    },
  };
};
