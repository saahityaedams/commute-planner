import { useEffect, useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import type { Itinerary, Leg } from "~/core/types";
import { PLACES, placeById, plan, planOptions, preferences } from "~/app.server";
import { penaltyMs } from "~/core/preferences";
import { fmtTime, istTodayAt, mins } from "~/lib/time";
import { Header, card } from "~/components/Header";
import { Timeline } from "~/components/Timeline";
import { RouteMap } from "~/components/RouteMap";
import { legColor, modeIcon } from "~/components/legStyle";

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
  // Preference penalties are computed server-side so the client needn't import core rules.
  const result = raw && {
    ...raw,
    options: raw.options.map((it) => ({ ...it, penaltyMin: mins(penaltyMs(it, preferences)) })),
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
    <Form method="get" className={`${card} p-2`}>
      <div className="relative">
        <PlaceField name="from" label="From" value={from} onChange={setFrom} places={places} dot="ring" />
        <div className="ml-[22px] h-px bg-zinc-100 dark:bg-zinc-800" />
        <PlaceField name="to" label="To" value={to} onChange={setTo} places={places} dot="solid" />
        <span className="pointer-events-none absolute left-[18px] top-[30px] h-[34px] border-l-2 border-dotted border-zinc-300 dark:border-zinc-600" />
        <button
          type="button"
          onClick={() => (setFrom(to), setTo(from))}
          aria-label="Swap from and to"
          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:text-zinc-900 active:scale-95 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v13M6 16l-3-3M6 16l3-3M14 17V4M14 4l-3 3M14 4l3 3" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-zinc-100 px-1 pt-2 dark:border-zinc-800">
        <label className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Depart</span>
          <input type="time" name="t" defaultValue={t} className="tnum bg-transparent font-medium text-zinc-900 outline-none dark:text-zinc-100" aria-label="Depart at (blank = now)" />
          {!t && <span className="text-xs text-zinc-400">now</span>}
        </label>
        <button
          type="submit"
          disabled={busy || !from || !to}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-40 dark:bg-white dark:text-zinc-900"
        >
          {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
          {busy ? "Planning" : "Find routes"}
        </button>
      </div>
    </Form>
  );
}

function PlaceField({ name, label, value, onChange, places, dot }: { name: string; label: string; value: string; onChange: (v: string) => void; places: PlaceOpt[]; dot: "ring" | "solid" }) {
  return (
    <label className="flex items-center gap-3 rounded-xl px-3 py-2.5 pr-14 focus-within:bg-zinc-50 dark:focus-within:bg-zinc-800/50">
      <span className={`h-3 w-3 shrink-0 rounded-full ${dot === "ring" ? "border-[3px] border-zinc-900 dark:border-zinc-100" : "bg-zinc-900 dark:bg-zinc-100"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</span>
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="-ml-1 w-full truncate bg-transparent text-[15px] font-medium outline-none invalid:text-zinc-400"
        >
          <option value="" disabled>
            Choose a place
          </option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.modes.length ? ` — ${p.modes.join(" + ")}` : " — auto"}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 px-6 text-center text-sm text-zinc-500">
      <div className="mx-auto mb-3 flex w-fit gap-1.5 text-lg">
        {["metro", "bus", "auto", "walk"].map((m) => (
          <span key={m}>{modeIcon[m]}</span>
        ))}
      </div>
      Bus, metro and Namma Yatri autos, combined — with traffic-corrected bus times.
    </div>
  );
}

const Notice = ({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "amber" }) => (
  <p className={`mt-4 rounded-xl px-3 py-2 text-xs ${tone === "amber" ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "text-zinc-500"}`}>{children}</p>
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

  if (!options.length) return <Notice tone="amber">No routes found{errors.length ? `: ${errors.join("; ")}` : "."}</Notice>;
  const top = options[order[0]];
  const shown = order.slice(0, showAll ? undefined : SHOW);

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[13px] font-semibold text-zinc-500">
          {options.length} route{options.length === 1 ? "" : "s"} · from {fmtTime(base)}
        </h2>
        <button onClick={() => revalidator.revalidate()} className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          {revalidator.state === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <ul className="space-y-2.5">
        {shown.map((i) => (
          <OptionCard
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
        <button onClick={() => setShowAll(!showAll)} className="mt-3 w-full rounded-xl py-2 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
          {showAll ? "Show fewer" : `${order.length - SHOW} more routes`}
        </button>
      )}
      {errors.length > 0 && <Notice tone="amber">{errors.join(" · ")}</Notice>}
    </section>
  );
}

function compareTo(it: Itinerary, ref: Itinerary) {
  const parts: string[] = [];
  const d = mins(it.arrive - ref.arrive);
  if (d) parts.push(d > 0 ? `${d} min later` : `${-d} min sooner`);
  if (it.fare !== null && ref.fare !== null && it.fare !== ref.fare) parts.push(it.fare < ref.fare ? `₹${ref.fare - it.fare} cheaper` : `₹${it.fare - ref.fare} more`);
  return parts.join(" · ");
}

const fareText = (f: number | null, legs: Leg[]) => (f === null ? "fare ?" : `${legs.some((l) => l.tags?.includes("estimate")) ? "~" : ""}₹${f}`);

function OptionCard({ it, base, badges, open, onToggle, vs, from, to }: { it: Option; base: number; badges?: string[]; open: boolean; onToggle: () => void; vs?: string; from: string; to: string }) {
  const traffic = it.legs.reduce((s, l) => s + (l.adjusted?.deltaMs ?? 0), 0);
  const recommended = badges?.includes("Recommended");
  return (
    <li className={`${card} overflow-hidden transition ${open ? "ring-1 ring-zinc-900/80 dark:ring-zinc-100/70" : ""}`}>
      <button onClick={onToggle} aria-expanded={open} className="block w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-2xl font-semibold tracking-tight">{mins(it.arrive - base)}</span>
              <span className="text-sm font-medium text-zinc-500">min</span>
            </div>
            <div className="tnum mt-0.5 text-[13px] text-zinc-500">
              {fmtTime(it.leave)} – {fmtTime(it.arrive)}
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-[15px] font-semibold">{fareText(it.fare, it.legs)}</div>
            {badges && (
              <div className="mt-1 flex flex-wrap justify-end gap-1">
                {badges.map((b) => (
                  <span
                    key={b}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      b === "Recommended" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <Chips legs={it.legs} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{it.transfers === 0 ? "Direct" : `${it.transfers} change${it.transfers > 1 ? "s" : ""}`}</span>
          {vs && <span>{vs}</span>}
          {traffic >= 60_000 && <span className="font-medium text-amber-600 dark:text-amber-400">+{mins(traffic)} min traffic</span>}
          {it.penaltyMin > 0 && !recommended && <span className="text-amber-600 dark:text-amber-400">long non-AC bus</span>}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-4 pb-4 dark:border-zinc-800">
          <Timeline it={it} startName={from} endName={to} />
          <RouteMap it={it} />
        </div>
      )}
    </li>
  );
}

function Chips({ legs }: { legs: Leg[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {legs.map((l, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <svg viewBox="0 0 6 10" className="h-2.5 w-1.5 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l4 4-4 4" />
            </svg>
          )}
          {l.mode === "walk" ? (
            <span className="tnum inline-flex items-center gap-0.5 text-zinc-500">
              {modeIcon.walk}
              {Math.max(1, mins(l.arr - l.dep))}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-[3px] font-semibold text-white" style={{ background: legColor(l) }}>
              <span className="text-[11px]">{modeIcon[l.mode]}</span>
              {l.mode === "auto" ? "Auto" : l.label}
              {l.tags?.includes("ac") && <span className="rounded bg-white/25 px-1 text-[9px] font-bold">AC</span>}
              {l.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" title="live-tracked" />}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
