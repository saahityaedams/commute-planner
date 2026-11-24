import type { Leg } from "~/core/types";

/** One colour per leg, shared by the timeline and the map. */
export function legColor(l: Pick<Leg, "mode" | "color" | "tags">): string {
  if (l.color) return l.color;
  switch (l.mode) {
    case "walk":
      return "#a1a1aa";
    case "bus":
      return l.tags?.includes("ac") ? "#0284c7" : "#52525b";
    case "auto":
      return "#16a34a";
    default:
      return "#7c3aed";
  }
}

export const modeIcon: Record<string, string> = { walk: "🚶", bus: "🚌", metro: "Ⓜ", auto: "🛺" };

export const legTitle = (l: Leg) =>
  l.mode === "metro" ? `${l.label} line` : l.mode === "bus" ? `Bus ${l.label}` : l.mode === "auto" ? "Auto (Namma Yatri)" : "Walk";
