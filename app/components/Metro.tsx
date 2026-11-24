import { fmtTime } from "~/lib/time";
import type { MetroJourney } from "~/sources/metro.server";

type StationOpt = { id: string; name: string; lines: string[] };

const LINE_DOT: Record<string, string> = { GREEN: "#009933", PURPLE: "#8C2877", YELLOW: "#E6C200" };

export function MetroStationSelect({
  name,
  stations,
  defaultValue,
  placeholder,
}: {
  name: string;
  stations: StationOpt[];
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
    >
      <option value="">{placeholder}</option>
      {stations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.lines.map((l) => l[0] + l.slice(1).toLowerCase()).join("/")})
        </option>
      ))}
    </select>
  );
}

export function LineBadge({ line }: { line: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: LINE_DOT[line] ?? "#888" }} />
      {line[0] + line.slice(1).toLowerCase()}
    </span>
  );
}

/** Compact one-line description of a metro journey. */
export function MetroLegs({ journey }: { journey: MetroJourney }) {
  return (
    <span>
      {journey.legs.map((l, i) => (
        <span key={i}>
          {i > 0 && " · change · "}
          <LineBadge line={l.line} /> {fmtTime(l.dep)} {l.from} → {l.to} {fmtTime(l.arr)}
        </span>
      ))}
    </span>
  );
}
