import { useEffect, useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import type { Itinerary, Leg } from "~/core/types";
import { PLACES, placeById, plan, planOptions, preferAc } from "~/app.server";
import { fmtTime, istTodayAt, mins } from "~/lib/time";
import { Header, card } from "~/components/Header";
import { Timeline } from "~/components/Timeline";
import { RouteMap } from "~/components/RouteMap";
import { legColor, legTextColor } from "~/components/legStyle";
import { ModeIcon } from "~/components/ModeIcon";

export function meta({ loaderData }: Route.MetaArgs) {
  const { a, b } = loaderData ?? {};
  return [{ title: a && b ? `${a.name} → ${b.name} · Commute` : "Commute" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  const a = placeById(q.get("from"));
  const b = placeById(q.get("to"));
  const t = q.get("t") ?? "";
  const base = (t && istTodayAt(t)) || Date.now();
  const raw = a && b && a.id !== b.id ? await plan(a, b, base) : null;
  // Preference checks run server-side so the client needn't import core rules.
  const result = raw && {
    ...raw,
    options: raw.options.map((it) => ({ ...it, longNonAc: preferAc.penaltyMs(it) > 0 })),
  };
  return {
    places: PLACES.map((p) => ({ id: p.id, name: p.name, modes: [...new Set(p.nodes.map((n) => n.mode))].filter((m) => m !== "auto") })),
    criteria: planOptions.criteria.map(({ id, label }) => ({ id, label })),
    a: a && { id: a.id, name: a.name },
    b: b && { id: b.id, name: b.name },
    t,
    base,
    result,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { places, criteria, a, b, t, base, result } = loaderData;

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <Header />
      <PlanForm key={`${a?.id}-${b?.id}-${t}`} places={places} from={a?.id} to={b?.id} t={t} />

      {a && b && a.id === b.id && <Notice>Pick two different places.</Notice>}
      {result && a && b && <Results key={`${a.id}-${b.id}-${base}`} result={result} criteria={criteria} base={base} from={a.name} to={b.name} />}
      {!result && !(a && b) && <EmptyState />}
    </main>
  );
}

// ---------- form ----------

type PlaceOpt = { id: string; name: string; modes: string[] };

function PlanForm({ places, from: from0, to: to0, t }: { places: PlaceOpt[]; from?: string; to?: string; t: string }) {
  const [from, setFrom] = useState(from0 ?? "");
  const [to, setTo] = useState(to0 ?? "");
  const busy = useNavigation().state !== "idle";

  return (
    <Form method="get" className={`${card} p-1.5`}>
      <div className="relative">
        <PlaceField name="from" label="From" value={from} onChange={setFrom} places={places} dot="ring" />
        <div className="ml-[38px] mr-14 h-px bg-rule" />
        <PlaceField name="to" label="To" value={to} onChange={setTo} places={places} dot="solid" />
        <span className="pointer-events-none absolute left-[19px] top-[34px] h-[38px] border-l-2 border-dotted border-faint" />
        <button
          type="button"
          onClick={() => (setFrom(to), setTo(from))}
          aria-label="Swap from and to"
          className="absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-rule bg-surface text-muted transition hover:text-ink active:scale-95"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v13M6 16l-3-3M6 16l3-3M14 17V4M14 4l-3 3M14 4l3 3" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-sunk px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Leave at
          <input type="time" name="t" defaultValue={t} className="tnum bg-transparent font-bold text-ink outline-none" aria-label="Leave at (blank means now)" />
          {!t && <span className="text-faint">or now</span>}
        </label>
        <button
          type="submit"
          disabled={busy || !from || !to}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-5 text-[15px] font-bold text-paper transition active:scale-[0.98] disabled:opacity-35"
        >
          {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
          {busy ? "Finding routes" : "Find routes"}
        </button>
      </div>
    </Form>
  );
}

function PlaceField({ name, label, value, onChange, places, dot }: { name: string; label: string; value: string; onChange: (v: string) => void; places: PlaceOpt[]; dot: "ring" | "solid" }) {
  return (
    <label className="flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 pr-14 focus-within:bg-sunk">
      <span className={`h-3 w-3 shrink-0 rounded-full ${dot === "ring" ? "border-[3px] border-ink" : "bg-ink"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="-ml-1 w-full truncate bg-transparent text-base font-bold outline-none invalid:font-normal invalid:text-faint"
        >
          <option value="" disabled>
            Choose a place
          </option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.modes.length ? ` (${p.modes.join(", ")})` : " (auto only)"}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 px-4 text-center">
      <div className="mx-auto mb-4 flex w-fit items-center gap-3 text-faint">
        {["walk", "auto", "metro", "bus"].map((m) => (
          <ModeIcon key={m} mode={m} className="h-5 w-5" />
        ))}
      </div>
      <p className="font-display text-lg">Where to today?</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
        Pick two places. Bus, metro and Namma Yatri autos get combined, and bus times are corrected for traffic.
      </p>
    </div>
  );
}

const Notice = ({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" }) => (
  <p className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm ${tone === "warn" ? "bg-warn-soft text-warn" : "text-muted"}`}>{children}</p>
);

// ---------- results ----------

type Result = NonNullable<Route.ComponentProps["loaderData"]["result"]>;
type Option = Result["options"][number];
const SHOW = 5;

function Results({ result, criteria, base, from, to }: { result: Result; criteria: { id: string; label: string }[]; base: number; from: string; to: string }) {
  const revalidator = useRevalidator();
  const { options, best, errors } = result;

  // Which criteria each option wins.
  const wins = new Map<number, string[]>();
  for (const c of criteria) {
    const w = best[c.id];
    if (!w) continue;
    const i = options.findIndex((o) => o.arrive === w.arrive && o.fare === w.fare && o.kind === w.kind && o.leave === w.leave);
    if (i >= 0) wins.set(i, [...(wins.get(i) ?? []), c.label]);
  }
  const order = [...new Set([...wins.keys(), ...options.map((_, i) => i)])];
  const [open, setOpen] = useState<number | null>(order[0] ?? null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setOpen(order[0] ?? null), [options]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!options.length) return <Notice tone="warn">No routes found{errors.length ? `: ${errors.join("; ")}` : "."}</Notice>;
  const top = options[order[0]];
  const shown = order.slice(0, showAll ? undefined : SHOW);

  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <h2 className="font-display text-lg">
          {options.length} way{options.length === 1 ? "" : "s"} there <span className="tnum font-sans text-sm text-muted">leaving {fmtTime(base)}</span>
        </h2>
        <button onClick={() => revalidator.revalidate()} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          {revalidator.state === "loading" ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <ul className={`${card} divide-y divide-rule overflow-hidden`}>
        {shown.map((i) => (
          <OptionRow
            key={i}
            it={options[i]}
            base={base}
            badges={wins.get(i)}
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
            vs={i === order[0] ? undefined : compareTo(options[i], top)}
            from={from}
            to={to}
          />
        ))}
      </ul>
      {order.length > SHOW && (
        <button onClick={() => setShowAll(!showAll)} className="mt-2 w-full rounded-xl py-2.5 text-sm text-muted hover:bg-surface hover:text-ink">
          {showAll ? "Show fewer" : `Show ${order.length - SHOW} more`}
        </button>
      )}
      {errors.length > 0 && <Notice tone="warn">{errors.join(". ")}</Notice>}
    </section>
  );
}

function compareTo(it: Itinerary, ref: Itinerary) {
  const parts: string[] = [];
  const d = mins(it.arrive - ref.arrive);
  if (d) parts.push(d > 0 ? `${d} min later` : `${-d} min sooner`);
  if (it.fare !== null && ref.fare !== null && it.fare !== ref.fare) parts.push(it.fare < ref.fare ? `₹${ref.fare - it.fare} cheaper` : `₹${it.fare - ref.fare} more`);
  return parts.join(", ");
}

const fareText = (f: number | null, legs: Leg[]) => (f === null ? "fare ?" : `${legs.some((l) => l.tags?.includes("estimate")) ? "~" : ""}₹${f}`);

function OptionRow({ it, base, badges, open, onToggle, vs, from, to }: { it: Option; base: number; badges?: string[]; open: boolean; onToggle: () => void; vs?: string; from: string; to: string }) {
  const traffic = it.legs.reduce((s, l) => s + (l.adjusted?.deltaMs ?? 0), 0);
  const recommended = badges?.includes("Recommended");
  const others = badges?.filter((b) => b !== "Recommended") ?? [];
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="block w-full px-4 pb-3.5 pt-4 text-left transition-colors hover:bg-sunk">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[32px] leading-none [font-variant-numeric:lining-nums_tabular-nums]">{mins(it.arrive - base)}</span>
              <span className="text-sm text-muted">min</span>
            </div>
            <div className="tnum mt-1.5 text-sm text-muted">
              {fmtTime(it.leave)} – {fmtTime(it.arrive)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="tnum text-lg font-bold leading-tight">{fareText(it.fare, it.legs)}</div>
            {recommended && <span className="rounded-full bg-marigold-soft px-2.5 py-0.5 text-xs font-bold text-ink">Recommended</span>}
            {others.length > 0 && <span className="text-right text-xs text-muted">{others.join(", ")}</span>}
          </div>
        </div>

        <div className="mt-3.5">
          <Chips legs={it.legs} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted">
          <span>{it.transfers === 0 ? "Direct" : `${it.transfers} change${it.transfers > 1 ? "s" : ""}`}</span>
          {vs && <span>{vs}</span>}
          {traffic >= 60_000 && <span className="font-bold text-warn">+{mins(traffic)} min traffic</span>}
          {it.longNonAc && <span className="text-warn">long non-AC bus</span>}
          <svg
            viewBox="0 0 12 12"
            className={`ml-auto h-3 w-3 text-faint transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-dashed border-rule px-4 pb-4">
          <Timeline it={it} startName={from} endName={to} />
          <RouteMap it={it} />
        </div>
      )}
    </li>
  );
}

function Chips({ legs }: { legs: Leg[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
      {legs.map((l, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <svg viewBox="0 0 6 10" className="h-2.5 w-1.5 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M1 1l4 4-4 4" />
            </svg>
          )}
          {l.mode === "walk" ? (
            <span className="tnum inline-flex items-center gap-0.5 text-muted" title="Walk">
              <ModeIcon mode="walk" />
              {Math.max(1, mins(l.arr - l.dep))}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md py-[3px] pl-1.5 pr-2 font-bold" style={{ background: legColor(l), color: legTextColor(l) }}>
              <ModeIcon mode={l.mode} />
              {l.mode === "auto" ? "Auto" : l.label}
              {l.tags?.includes("ac") && <span className="rounded bg-white/25 px-1 text-[10px]">AC</span>}
              {l.live && <span className="h-1.5 w-1.5 rounded-full bg-[#9be3b0]" title="Live-tracked bus" />}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
