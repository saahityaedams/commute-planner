import type { Criterion } from "./types";

const fareOf = (f: number | null) => (f === null ? Infinity : f);

export const fastest: Criterion = {
  id: "fastest",
  label: "Fastest",
  compare: (a, b) => a.arrive - b.arrive || a.transfers - b.transfers || fareOf(a.fare) - fareOf(b.fare),
};

export const cheapest: Criterion = {
  id: "cheapest",
  label: "Cheapest",
  compare: (a, b) => fareOf(a.fare) - fareOf(b.fare) || a.arrive - b.arrive,
};

export const fewestChanges: Criterion = {
  id: "fewest-changes",
  label: "Fewest changes",
  compare: (a, b) => a.transfers - b.transfers || a.arrive - b.arrive,
};

export const leastWalking: Criterion = {
  id: "least-walking",
  label: "Least walking",
  compare: (a, b) => {
    const walk = (it: typeof a) => it.legs.reduce((s, l) => s + (l.mode === "walk" ? (l.meters ?? 0) : 0), 0);
    return walk(a) - walk(b) || a.arrive - b.arrive;
  },
};
