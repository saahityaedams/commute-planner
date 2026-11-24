import { useEffect, useRef } from "react";
import type { Itinerary } from "~/core/types";
import { legColor } from "./legStyle";
import "leaflet/dist/leaflet.css";

/** Leaflet map of an itinerary's legs (client-only; Leaflet touches `window` on import). */
export function RouteMap({ it }: { it: Itinerary }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    import("leaflet").then((L) => {
      if (disposed || !el.current) return;
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      map = L.map(el.current, { zoomControl: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: dark ? "map-tiles-dark" : "map-tiles",
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      for (const l of it.legs) {
        if (!l.path || l.path.length < 2) continue;
        const walk = l.mode === "walk";
        L.polyline(l.path, { color: legColor(l), weight: walk ? 3 : 5, opacity: walk ? 0.9 : 0.85, dashArray: walk ? "2 6" : undefined })
          .bindTooltip(`${l.label} · ${l.from} → ${l.to}`)
          .addTo(map);
        l.path.forEach((p) => bounds.extend(p));
      }
      // Dots where you board or get off.
      it.legs.forEach((l, i) => {
        if (!l.path?.length) return;
        const ends = i === it.legs.length - 1 ? [l.path[0], l.path[l.path.length - 1]] : [l.path[0]];
        for (const p of ends)
          L.circleMarker(p, { radius: 5, color: dark ? "#fafafa" : "#18181b", weight: 2, fillColor: dark ? "#18181b" : "#fff", fillOpacity: 1 }).addTo(map!);
      });
      if (bounds.isValid()) {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [28, 28] });
      }
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [it]);

  return <div ref={el} className="mt-3 h-64 w-full overflow-hidden rounded-xl bg-zinc-200 sm:h-80 dark:bg-zinc-800" />;
}
