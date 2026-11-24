import type { Leg } from "~/core/types";

/** One colour per leg, shared by the timeline and the map. */
export function legColor(l: Pick<Leg, "mode" | "color" | "tags">): string {
  if (l.color) return l.color;
  switch (l.mode) {
    case "walk":
      return "#9aa0a8";
    case "bus":
      return l.tags?.includes("ac") ? "#1f6fb2" : "#4b5563";
    case "auto":
      return "#2f8a4c";
    default:
      return "#7a3f8c";
  }
}

export const legTitle = (l: Leg) =>
  l.mode === "metro" ? `${l.label} line` : l.mode === "bus" ? `Bus ${l.label}` : l.mode === "auto" ? "Auto (Namma Yatri)" : "Walk";

/** Readable text colour on top of a leg's colour (dark ink on light lines like Yellow). */
export function legTextColor(l: Pick<Leg, "mode" | "color" | "tags">): string {
  const hex = legColor(l).replace("#", "");
  if (hex.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#1f2633" : "#fff";
}
