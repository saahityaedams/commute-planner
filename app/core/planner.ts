import { distanceM } from "./geo";
import { chain, itinerary, signature, walkLeg } from "./itinerary";
import type { Constraint, Criterion, Itinerary, Node, Place, Provider } from "./types";

export interface PlanOptions {
  providers: Provider[];
  /** Places where you may switch provider. */
  transferPlaces: Place[];
  criteria: Criterion[];
  /** Rules every itinerary must pass (checked per segment and on the full chain). */
  constraints?: Constraint[];
  /** Max provider segments chained (1 = single provider, 2 = one switch, …). Feeder segments don't count. */
  maxSegments?: number;
  /**
   * Segments beyond the second must start within this straight-line distance of the destination:
   * a third segment is a short last hop (e.g. metro, then a bus to the door), never a detour.
   * Keeps the fan-out of long chains small. Default: no limit.
   */
  extraSegmentRadiusM?: number;
  /**
   * First/last-mile providers (e.g. autos): used only as the first and/or last segment, never on their own,
   * and only for hops up to `feederRadiusM` (straight line). They don't count toward `maxSegments`.
   * With feederEnds "off-network" (default) they only bridge an end the core network doesn't reach
   * (a place with no core-mode node); "any" also allows them at stops the network serves.
   */
  feeders?: string[];
  feederRadiusM?: number;
  feederEnds?: "off-network" | "any";
  /** A first-mile feeder tries only this many nearest handover places (default 4). */
  feederTargets?: number;
  /** Itineraries kept per provider call on intermediate hops (Pareto-best on time/fare/changes; bounds fan-out). */
  perHop?: number;
  /** Ask providers for this many times more results than kept, so constraints don't starve a hop. */
  overfetch?: number;
  /** Itineraries kept per provider call on the final hop. */
  perFinalHop?: number;
  /** Drop options arriving this much later than the fastest. */
  slackMs?: number;
  /**
   * Re-estimate the finalists with something costlier (e.g. live traffic) and rank only those.
   * Sound when `fn` never makes an itinerary faster: anything outside the top `top` can't overtake.
   */
  refine?: { top: number; fn: (it: Itinerary) => Promise<Itinerary> };
}

export interface PlanResult {
  options: Itinerary[]; // distinct routes, ordered by the first criterion
  best: Record<string, Itinerary | null>; // criterion id → winner
  errors: string[];
}

interface State {
  place: Place;
  node: Node | null; // node we're standing at (null = anywhere in the start place)
  at: number;
  parts: Itinerary[];
  lastProvider: string | null;
  lastWasFeeder: boolean;
  used: number; // non-feeder segments so far
  visited: Set<string>;
}

export async function plan(from: Place, to: Place, departAt: number, opts: PlanOptions): Promise<PlanResult> {
  const { providers, criteria, constraints = [], maxSegments = 2, perHop = 3, perFinalHop = 3, overfetch = 4, slackMs = 60 * 60_000 } = opts;
  const feederIds = new Set(opts.feeders ?? []);
  const radius = opts.feederRadiusM ?? Infinity;
  const isFeeder = (p: Provider) => feederIds.has(p.id);
  const feederModes = new Set(providers.filter(isFeeder).map((p) => p.mode));
  const coreModes = new Set(providers.filter((p) => !isFeeder(p)).map((p) => p.mode));
  const offNetwork = (pl: Place) => !pl.nodes.some((n) => coreModes.has(n.mode));
  const anyEnds = opts.feederEnds === "any";
  const firstMileOk = anyEnds || offNetwork(from);
  const lastMileOk = anyEnds || offNetwork(to);

  const ok = (it: Itinerary) => constraints.every((c) => c.accept(it));
  const errors: string[] = [];
  const memo = new Map<string, Promise<Itinerary[]>>();

  const route = (p: Provider, a: Node, b: Node, t: number, limit: number) => {
    const key = `${p.id}|${a.ref}|${b.ref}|${Math.floor(t / 60_000)}|${limit}`;
    let hit = memo.get(key);
    if (!hit) {
      hit = p.route({ from: a, to: b, departAt: t, limit }).catch((e) => {
        errors.push(`${p.id} ${a.name} → ${b.name}: ${e instanceof Error ? e.message : e}`);
        return [];
      });
      memo.set(key, hit);
    }
    return hit;
  };

  const modesOf = (pl: Place) => new Set(pl.nodes.map((n) => n.mode));
  const nodesFor = (pl: Place, mode: string) => pl.nodes.filter((n) => n.mode === mode);
  const within = (a: Place, b: Place, r: number) =>
    a.nodes.some((x) => b.nodes.some((y) => distanceM(x.lat, x.lon, y.lat, y.lon) <= r));
  const near = (a: Place, b: Place) => within(a, b, radius);
  const extraRadius = opts.extraSegmentRadiusM ?? Infinity;

  async function expand(s: State): Promise<Itinerary[]> {
    const out: Promise<Itinerary[]>[] = [];
    const atStart = s.parts.length === 0;

    for (const p of providers) {
      if (p.id === s.lastProvider) continue; // a provider already handles its own internal transfers
      const feeder = isFeeder(p);
      if (feeder && (s.lastWasFeeder || !((atStart && firstMileOk) || (!atStart && s.used > 0 && lastMileOk)))) continue;
      if (!feeder && s.used >= maxSegments) continue;
      if (!feeder && s.used >= 2 && !within(s.place, to, extraRadius)) continue;
      const starts = nodesFor(s.place, p.mode);
      if (!starts.length) continue;
      const used = s.used + (feeder ? 0 : 1);

      // Where can this hop end?
      const targets: Place[] = [];
      if (feeder) {
        if (atStart) {
          // First mile: to a nearby place where a core mode continues (never straight to the destination).
          const dist = (x: Place) => Math.min(...s.place.nodes.flatMap((a) => x.nodes.map((b) => distanceM(a.lat, a.lon, b.lat, b.lon))));
          targets.push(
            ...opts.transferPlaces
              .filter((x) => x.id !== to.id && !s.visited.has(x.id) && near(s.place, x) && [...modesOf(x)].some((m) => coreModes.has(m)))
              .sort((x, y) => dist(x) - dist(y))
              .slice(0, opts.feederTargets ?? 4),
          );
        } else if (near(s.place, to)) targets.push(to); // last mile
      } else {
        targets.push(to);
        for (const x of opts.transferPlaces) {
          if (x.id === to.id || s.visited.has(x.id)) continue;
          const m = modesOf(x);
          if (!m.has(p.mode)) continue;
          const others = [...m].filter((mode) => mode !== p.mode);
          const onward = used < maxSegments && (used < 2 || within(x, to, extraRadius)) && others.some((mode) => coreModes.has(mode));
          const lastMile = lastMileOk && others.some((mode) => feederModes.has(mode)) && near(x, to);
          if (onward || lastMile) targets.push(x);
        }
      }

      for (const a of starts) {
        // Moving between nodes of the same place (e.g. bus stop → metro entrance).
        const transferWalk = s.node && s.node !== a ? walkLeg(s.node, a, s.at, 30) : null; // same spot → no walk
        const readyAt = transferWalk ? transferWalk.arr : s.at;
        const prefix = transferWalk ? [...s.parts, itinerary([transferWalk])] : s.parts;

        for (const target of targets) {
          for (const b of nodesFor(target, p.mode)) {
            if (a === b) continue;
            const final = target.id === to.id;
            out.push(
              route(p, a, b, readyAt + p.accessMs, (final ? perFinalHop : perHop) * overfetch).then(async (its) => {
                const segs = its
                  .map((it) => ({ ...it, leave: it.leave - p.accessMs, arrive: it.arrive + p.egressMs }))
                  .filter(ok);
                if (final) return segs.slice(0, perFinalHop).map((seg) => chain([...prefix, seg]));
                const deeper = await Promise.all(
                  paretoFront(segs).slice(0, perHop).map((seg) =>
                    expand({
                      place: target,
                      node: b,
                      at: seg.arrive,
                      parts: [...prefix, seg],
                      lastProvider: p.id,
                      lastWasFeeder: feeder,
                      used,
                      visited: new Set([...s.visited, target.id]),
                    }),
                  ),
                );
                return deeper.flat();
              }),
            );
          }
        }
      }
    }
    return (await Promise.all(out)).flat();
  }

  const all = await expand({
    place: from,
    node: null,
    at: departAt,
    parts: [],
    lastProvider: null,
    lastWasFeeder: false,
    used: 0,
    visited: new Set([from.id]),
  });

  // Can't leave before you asked to; one option per physical route (keeping the primary criterion's best).
  const primary = criteria[0];
  const dedupe = (its: Itinerary[]) => {
    const seen = new Set<string>();
    return [...its].sort(primary.compare).filter((it) => {
      const sig = signature(it);
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  };
  let options = dedupe(all.filter((it) => it.leave >= departAt - 60_000 && Number.isFinite(it.arrive) && ok(it)));

  if (opts.refine && options.length) {
    // Finalists: the top N by the primary criterion plus each criterion's winner.
    const finalists = new Set(options.slice(0, opts.refine.top));
    for (const c of criteria) finalists.add([...options].sort(c.compare)[0]);
    const refined = await Promise.all(
      [...finalists].map((it) =>
        opts.refine!.fn(it).catch((e) => {
          errors.push(`refine: ${e instanceof Error ? e.message : e}`);
          return it;
        }),
      ),
    );
    options = dedupe(refined.filter(ok));
  }

  const fastestArrive = Math.min(...options.map((it) => it.arrive));
  options = options.filter((it) => it.arrive - fastestArrive <= slackMs);

  const best = Object.fromEntries(criteria.map((c) => [c.id, options.length ? [...options].sort(c.compare)[0] : null]));
  return { options, best, errors };
}

const fareOf = (it: Itinerary) => it.fare ?? Infinity;

/** Itineraries not beaten on every one of arrival, fare and changes by another; earliest first. */
export function paretoFront(its: Itinerary[]): Itinerary[] {
  const dominated = (x: Itinerary, y: Itinerary) =>
    y.arrive <= x.arrive &&
    fareOf(y) <= fareOf(x) &&
    y.transfers <= x.transfers &&
    (y.arrive < x.arrive || fareOf(y) < fareOf(x) || y.transfers < x.transfers);
  return its.filter((x) => !its.some((y) => dominated(x, y))).sort((x, y) => x.arrive - y.arrive);
}
