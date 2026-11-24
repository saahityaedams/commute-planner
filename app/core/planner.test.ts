import { describe, expect, it } from "vitest";
import { cheapest, fastest } from "./criteria";
import { itinerary } from "./itinerary";
import { plan } from "./planner";
import type { Node, Place, Provider } from "./types";

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 3, 30); // 09:00 IST

// A, X, B on a line ~1 km apart; X has both modes (a transfer point).
const node = (mode: string, ref: string, lat: number): Node => ({ mode, ref, name: ref, lat, lon: 77.6 });
const A: Place = { id: "A", name: "A", nodes: [node("train", "A-t", 12.90), node("bus", "A-b", 12.90)] };
const X: Place = { id: "X", name: "X", nodes: [node("train", "X-t", 12.91), node("bus", "X-b", 12.91)] };
const B: Place = { id: "B", name: "B", nodes: [node("bus", "B-b", 12.92)] };

/** Fake provider: fixed duration/fare per hop, departs every `headway` minutes. */
function fake(id: string, mode: string, table: Record<string, { mins: number; fare: number }>, headway = 10): Provider {
  return {
    id, mode, accessMs: 0, egressMs: 0,
    async route({ from, to, departAt, limit }) {
      const hop = table[`${from.ref}>${to.ref}`];
      if (!hop) return [];
      const first = Math.ceil(departAt / (headway * MIN)) * headway * MIN;
      return Array.from({ length: limit }, (_, i) => {
        const dep = first + i * headway * MIN;
        return itinerary([{ mode, label: id, from: from.name, to: to.name, dep, arr: dep + hop.mins * MIN, fare: hop.fare }]);
      });
    },
  };
}

const train = fake("train", "train", { "A-t>X-t": { mins: 3, fare: 30 } }, 5);
const bus = fake("bus", "bus", { "A-b>B-b": { mins: 40, fare: 10 }, "X-b>B-b": { mins: 10, fare: 10 } });

describe("core planner", () => {
  it("chains providers through a transfer place and ranks by criteria", async () => {
    const r = await plan(A, B, T0, { providers: [train, bus], transferPlaces: [X], criteria: [fastest, cheapest] });

    expect(r.errors).toEqual([]);
    expect(r.best.fastest?.kind).toBe("train → bus");
    expect(r.best.fastest?.fare).toBe(40);
    expect(r.best.cheapest?.kind).toBe("bus");
    expect(r.best.cheapest?.fare).toBe(10);
    expect(r.best.fastest!.arrive).toBeLessThan(r.best.cheapest!.arrive);
  });

  it("never schedules a connection before the previous leg arrives", async () => {
    const r = await plan(A, B, T0, { providers: [train, bus], transferPlaces: [X], criteria: [fastest] });
    for (const it of r.options) {
      for (let i = 1; i < it.legs.length; i++) expect(it.legs[i].dep).toBeGreaterThanOrEqual(it.legs[i - 1].arr);
    }
  });

  it("records provider failures without failing the plan", async () => {
    const broken: Provider = { ...bus, id: "broken", route: async () => { throw new Error("down"); } };
    const r = await plan(A, B, T0, { providers: [train, broken], transferPlaces: [X], criteria: [fastest] });
    expect(r.options).toEqual([]);
    expect(r.errors.some((e) => e.includes("down"))).toBe(true);
  });
});

import { noSameModeChange } from "./constraints";
import { paretoFront } from "./planner";

describe("constraints", () => {
  const leg = (mode: string, label: string, dep: number, tags: string[] = []) => ({
    mode, label, from: "a", to: "b", dep: T0 + dep * MIN, arr: T0 + (dep + 5) * MIN, fare: 10, tags,
  });
  const rule = noSameModeChange("bus", "ac");

  it("rejects a bus→bus change unless both buses are AC", () => {
    expect(rule.accept(itinerary([leg("bus", "285", 0), leg("bus", "365-P", 10)]))).toBe(false);
    expect(rule.accept(itinerary([leg("bus", "V-500D", 0, ["ac"]), leg("bus", "285", 10)]))).toBe(false);
    expect(rule.accept(itinerary([leg("bus", "V-500D", 0, ["ac"]), leg("bus", "KIA-9", 10, ["ac"])]))).toBe(true);
  });

  it("allows single buses and bus↔metro changes, and ignores walks in between", () => {
    expect(rule.accept(itinerary([leg("bus", "K-2", 0)]))).toBe(true);
    expect(rule.accept(itinerary([leg("bus", "K-2", 0), leg("walk", "Walk", 5), leg("metro", "Green", 10)]))).toBe(true);
    expect(rule.accept(itinerary([leg("bus", "285", 0), leg("walk", "Walk", 5), leg("bus", "343", 10)]))).toBe(false);
  });

  it("prunes plans that break a constraint", async () => {
    const twoBus = fake("bus", "bus", { "A-b>B-b": { mins: 40, fare: 10 } });
    const changing: Provider = {
      ...twoBus,
      async route(req) {
        const [one] = await twoBus.route(req);
        const mid = one.legs[0].dep + 20 * MIN;
        return [itinerary([{ ...one.legs[0], arr: mid }, { ...one.legs[0], label: "other", dep: mid, arr: one.legs[0].arr }])];
      },
    };
    const r = await plan(A, B, T0, { providers: [changing], transferPlaces: [], criteria: [fastest], constraints: [rule] });
    expect(r.options).toEqual([]);
  });
});

describe("paretoFront", () => {
  it("keeps a slower option if it is cheaper", () => {
    const mk = (arrive: number, fare: number) => ({ ...itinerary([{ mode: "bus", label: "x", from: "a", to: "b", dep: T0, arr: T0 + arrive * MIN, fare }]) });
    const fastPricey = mk(20, 125), slowCheap = mk(30, 23), dominated = mk(35, 50);
    expect(paretoFront([dominated, slowCheap, fastPricey])).toEqual([fastPricey, slowCheap]);
  });
});

import { retime } from "./retime";
import { preferTagOnLongLegs, recommended } from "./preferences";
import { withPointMode } from "./places";

describe("retime", () => {
  const bus = (label: string, dep: number, dur: number) => ({ mode: "bus", label, from: "a", to: "b", dep: T0 + dep * MIN, arr: T0 + (dep + dur) * MIN, fare: 10 });

  it("stretches slow legs and pushes later legs back", async () => {
    const it0 = itinerary([bus("500-D", 0, 30), { mode: "walk", label: "Walk", from: "b", to: "c", dep: T0 + 30 * MIN, arr: T0 + 33 * MIN, fare: 0 }, bus("V-1", 35, 10)]);
    const out = await retime(it0, async (l) => (l.label === "500-D" ? { durationMs: 50 * MIN, reason: "traffic" } : null));
    expect(out.legs[0].arr).toBe(T0 + 50 * MIN);
    expect(out.legs[0].adjusted).toEqual({ reason: "traffic", deltaMs: 20 * MIN });
    expect(out.legs[1].dep).toBe(T0 + 50 * MIN); // walk follows
    expect(out.legs[2].dep).toBe(T0 + 53 * MIN); // next bus can't leave before you arrive
    expect(out.arrive).toBe(T0 + 63 * MIN);
  });

  it("applies patches and recomputes the fare", async () => {
    const out = await retime(itinerary([bus("auto", 0, 10)]), async () => ({ durationMs: 12 * MIN, patch: { fare: 99 } }));
    expect(out.fare).toBe(99);
    expect(out.legs[0].adjusted).toBeUndefined(); // no reason given
  });
});

describe("feeders and refine", () => {
  // S (auto-only) is 2 km from X; X has bus + auto; B is the destination.
  const S: Place = { id: "S", name: "S", nodes: [node("auto", "S-a", 12.892)] };
  const Xf: Place = { ...X, nodes: [...X.nodes, node("auto", "X-a", 12.91)] };
  const Bf: Place = { ...B, nodes: [...B.nodes, node("auto", "B-a", 12.92)] };
  const auto = fake("auto", "auto", { "S-a>X-a": { mins: 8, fare: 60 }, "S-a>B-a": { mins: 20, fare: 200 } });
  const opts = { providers: [auto, bus], transferPlaces: [Xf], criteria: [fastest], feeders: ["auto"], feederRadiusM: 5000 };

  it("uses a feeder for the first mile but never on its own", async () => {
    const r = await plan(S, Bf, T0, opts);
    expect(r.options.length).toBeGreaterThan(0);
    for (const it of r.options) {
      const modes = it.legs.filter((l) => l.mode !== "walk").map((l) => l.mode);
      expect(modes[0]).toBe("auto");
      expect(modes).toContain("bus");
    }
  });

  it("only shows refined finalists, re-ranked", async () => {
    const r = await plan(S, Bf, T0, { ...opts, refine: { top: 1, fn: async (it) => ({ ...it, arrive: it.arrive + 5 * MIN, kind: "refined" }) } });
    expect(r.options.every((it) => it.kind === "refined")).toBe(true);
  });
});

describe("preferences", () => {
  const leg = (label: string, dur: number, tags: string[] = []) => ({ mode: "bus", label, from: "a", to: "b", dep: T0, arr: T0 + dur * MIN, fare: 10, tags });
  const pref = preferTagOnLongLegs("bus", "ac", { overMs: 20 * MIN, weight: 0.5 });

  it("penalises only long untagged legs", () => {
    expect(pref.penaltyMs(itinerary([leg("K-2", 15)]))).toBe(0);
    expect(pref.penaltyMs(itinerary([leg("V-500CA", 50, ["ac"])]))).toBe(0);
    expect(pref.penaltyMs(itinerary([leg("500-D", 40)]))).toBe(10 * MIN);
  });

  it("recommends a slightly slower AC ride over a long non-AC one", () => {
    const ordinary = itinerary([leg("500-D", 45)]);
    const ac = itinerary([leg("V-500CA", 50, ["ac"])]);
    expect([ordinary, ac].sort(recommended([pref]).compare)[0]).toBe(ac);
  });
});

describe("withPointMode", () => {
  it("adds a point node to places lacking that mode", () => {
    const [a] = withPointMode([B], "auto");
    expect(a.nodes.map((n) => n.mode)).toEqual(["bus", "auto"]);
    expect(withPointMode([a], "auto")[0].nodes).toHaveLength(2);
  });
});

import { distrustCorrections, fewerChanges } from "./preferences";

describe("three-segment chains", () => {
  // H (bus only) → M (bus+train) → S (train+bus) → D (bus only). Bus→train→bus needs 3 segments.
  const H: Place = { id: "H", name: "H", nodes: [node("bus", "H-b", 13.0)] };
  const M: Place = { id: "M", name: "M", nodes: [node("bus", "M-b", 12.98), node("train", "M-t", 12.98)] };
  const S: Place = { id: "S", name: "S", nodes: [node("train", "S-t", 12.93), node("bus", "S-b", 12.93)] };
  const D: Place = { id: "D", name: "D", nodes: [node("bus", "D-b", 12.92)] }; // ~1.1 km from S, ~9 km from M
  const bus3 = fake("bus", "bus", { "H-b>M-b": { mins: 15, fare: 20 }, "S-b>D-b": { mins: 6, fare: 6 }, "H-b>D-b": { mins: 120, fare: 30 } });
  const train3 = fake("train", "train", { "M-t>S-t": { mins: 20, fare: 60 } }, 5);
  const base = { providers: [train3, bus3], transferPlaces: [M, S], criteria: [fastest] };

  it("finds bus → train → bus when three segments are allowed", async () => {
    const two = await plan(H, D, T0, { ...base, maxSegments: 2 });
    expect(two.best.fastest?.kind).toBe("bus");
    const three = await plan(H, D, T0, { ...base, maxSegments: 3 });
    expect(three.best.fastest?.kind).toBe("bus → train → bus");
  });

  it("only allows the third segment as a short hop near the destination", async () => {
    const near = await plan(H, D, T0, { ...base, maxSegments: 3, extraSegmentRadiusM: 2000 });
    expect(near.best.fastest?.kind).toBe("bus → train → bus");
    const tooFar = await plan(H, D, T0, { ...base, maxSegments: 3, extraSegmentRadiusM: 500 });
    expect(tooFar.best.fastest?.kind).toBe("bus");
  });
});

describe("preferences", () => {
  const leg = (mode: string, dep: number, mins: number, deltaMin = 0) => ({
    mode, label: mode, from: "a", to: "b", dep: T0 + dep * MIN, arr: T0 + (dep + mins) * MIN, fare: 10,
    ...(deltaMin ? { adjusted: { reason: "traffic", deltaMs: deltaMin * MIN } } : {}),
  });

  it("charges a fixed hassle per change", () => {
    const p = fewerChanges(5 * MIN);
    expect(p.penaltyMs(itinerary([leg("bus", 0, 30)]))).toBe(0);
    expect(p.penaltyMs(itinerary([leg("bus", 0, 10), leg("walk", 10, 3), leg("metro", 15, 10)]))).toBe(5 * MIN);
  });

  it("weights corrected minutes extra, and only those", () => {
    const p = distrustCorrections(0.5);
    expect(p.penaltyMs(itinerary([leg("bus", 0, 60, 20), leg("metro", 60, 20)]))).toBe(10 * MIN);
  });
});
