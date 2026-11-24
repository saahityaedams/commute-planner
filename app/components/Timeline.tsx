import type { Itinerary, Leg } from "~/core/types";
import { fmtTime, mins } from "~/lib/time";
import { legColor, legTitle, modeIcon } from "./legStyle";

/** Road metres → walking minutes at 4.5 km/h. */
const walkMinutes = (m: number) => m / 75;
const roundM = (m = 0) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 50) * 50} m`);
const fareText = (l: Leg) => (l.fare ? `${l.tags?.includes("estimate") ? "~" : ""}₹${l.fare}` : null);

/**
 * The commute as a vertical timeline: a stop row (time + place) between each leg,
 * and a coloured rail for each leg with what to board, how long, and any waits or traffic corrections.
 */
export function Timeline({ it, startName, endName }: { it: Itinerary; startName: string; endName: string }) {
  const rows: React.ReactNode[] = [];
  const firstDep = it.legs[0]?.dep ?? it.leave;

  const first = it.legs[0];
  const boardLater = first && first.mode !== "walk" && firstDep - it.leave >= 60_000;
  const startNote = boardLater
    ? `leave · ${first.mode === "auto" ? "auto picks you up" : `board ${legTitle(first)}`} ~${fmtTime(firstDep)}`
    : "leave";
  rows.push(<Stop key="start" time={it.leave} name={startName} note={startNote} strong />);

  it.legs.forEach((l, i) => {
    const prev = it.legs[i - 1];
    if (i > 0) {
      const wait = l.dep - prev.arr;
      // Stop between legs: where you get off/on. Skip when a walk just continues to the next leg's start.
      rows.push(
        <Stop
          key={`s${i}`}
          time={prev.arr}
          name={l.from}
          note={wait >= 60_000 ? `wait ${mins(wait)} min · board ${fmtTime(l.dep)}` : undefined}
        />,
      );
    }
    rows.push(<Rail key={`l${i}`} leg={l} />);
  });

  rows.push(<Stop key="end" time={it.arrive} name={endName} note="arrive" strong />);
  return <ol className="mt-3">{rows}</ol>;
}

function Stop({ time, name, note, strong }: { time: number; name: string; note?: string; strong?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span className={`w-11 shrink-0 text-right text-sm tabular-nums ${strong ? "font-semibold" : "text-zinc-600 dark:text-zinc-400"}`}>{fmtTime(time)}</span>
      <span className="relative flex w-4 shrink-0 justify-center">
        <span className={`h-3 w-3 rounded-full border-2 border-zinc-900 dark:border-zinc-100 ${strong ? "bg-zinc-900 dark:bg-zinc-100" : "bg-white dark:bg-zinc-950"}`} />
      </span>
      <span className="min-w-0 text-sm">
        <span className={strong ? "font-semibold" : "font-medium"}>{name}</span>
        {note && <span className="ml-2 text-xs text-zinc-500">{note}</span>}
      </span>
    </li>
  );
}

function Rail({ leg: l }: { leg: Leg }) {
  const color = legColor(l);
  const dur = mins(l.arr - l.dep);
  const walk = l.mode === "walk";
  return (
    <li className="flex gap-3">
      <span className="w-11 shrink-0" />
      <span className="flex w-4 shrink-0 justify-center">
        <span
          className="w-1 rounded-full"
          style={walk ? { borderLeft: `3px dotted ${color}`, width: 0 } : { background: color }}
        />
      </span>
      <div className={`min-w-0 flex-1 text-sm ${walk ? "py-1.5" : "py-2.5"}`}>
        {walk ? (
          <span className="text-xs text-zinc-500">
            {modeIcon.walk} Walk {roundM(l.meters)} · {Math.max(1, dur)} min
          </span>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: color }}>
                {modeIcon[l.mode] ?? "•"} {l.mode === "auto" ? "Auto" : l.label}
              </span>
              {l.tags?.includes("ac") && <span className="text-xs font-medium text-sky-600">AC</span>}
              {l.live && <span className="text-xs text-emerald-600">● live</span>}
              <span className="text-xs text-zinc-500">
                {dur} min{l.meters ? ` · ${roundM(l.meters)}` : ""}
                {fareText(l) ? ` · ${fareText(l)}` : ""}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {l.from} → {l.to}
              {l.detail && <span className="text-zinc-500"> · {l.detail}</span>}
            </div>
            {l.mode === "auto" && l.meters !== undefined && l.meters < 1000 && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                {modeIcon.walk} Under 1 km — walking is ~{Math.round(walkMinutes(l.meters))} min and free
              </div>
            )}
            {l.adjusted && (
              <div className="mt-0.5 text-xs text-amber-600">
                +{mins(l.adjusted.deltaMs)} min for {l.adjusted.reason} ({l.mode === "bus" ? "BMTC says" : "estimate was"} {dur - mins(l.adjusted.deltaMs)} min)
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
