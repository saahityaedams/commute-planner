import type { Route } from "./+types/about";
import { AUTO_RADIUS_M, BUS_VS_CAR, FINALISTS, PLACES, planOptions, preferences } from "~/app.server";
import { NAMMA_YATRI_AUTO } from "~/providers/namma-yatri.server";
import { MONTHLY_LIMIT, googleCallsThisMonth } from "~/sources/google.server";
import { Link } from "react-router";
import { Header, card } from "~/components/Header";

export function meta() {
  return [{ title: "About · Commute" }];
}

export async function loader() {
  return {
    google: { used: await googleCallsThisMonth().catch(() => null), limit: MONTHLY_LIMIT },
    places: PLACES.map((p) => p.name),
    rules: (planOptions.constraints ?? []).map((c) => c.label),
    prefs: preferences.map((p) => p.label),
    rankings: planOptions.criteria.map((c) => c.label),
    busVsCar: BUS_VS_CAR,
    autoKm: AUTO_RADIUS_M / 1000,
    finalists: FINALISTS,
    auto: NAMMA_YATRI_AUTO,
  };
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-2 mt-8 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{children}</h2>
);

export default function About({ loaderData }: Route.ComponentProps) {
  const { places, rules, prefs, rankings, busVsCar, autoKm, finalists, auto, google } = loaderData;
  return (
    <main className="mx-auto max-w-xl px-4 pb-10 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <Header />

      <div className={`${card} p-4`}>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600">Vibe-coded</div>
        <b className="text-zinc-900 dark:text-zinc-100">This is a vibe-coded app.</b> Built conversationally with an AI coding agent for one person's Bengaluru commute. It reads
        unofficial APIs, guesses fares, and bakes in my own habits.
      </div>

      <H>My places</H>
      <p>{places.join(" · ")}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Every place is also an auto pickup/drop point. Places with metro + bus are transfer points. Add more on{" "}
        <Link to="/places" className="underline">Places</Link>.
      </p>

      <H>My nuances</H>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <b>I'm a public-transport commuter.</b> Bus and metro do the work; everything else is getting to and from them.
        </li>
        <li>
          <b>I don't trust BMTC's times.</b> Its planner uses timetables with no traffic (it says 45 min for 28 km from Silk Board to Hebbal at
          6 pm). So each bus leg takes at least Google's traffic-aware driving time for that stretch, scaled to the bus route's length, × {busVsCar}.
          Later legs shift to match. Shown in amber as "+N min traffic".
        </li>
        <li>
          <b>Short hops on any bus are fine; longer rides should be AC</b> — Vajra (V-500CA, V-285M…) or Vayu Vajra (KIA-…). This is a preference,
          not a ban: a long non-AC ride counts as 1.5× its minutes beyond 20 when ranking "Recommended", but still shows up.
        </li>
        <li>
          <b>No changing between buses unless both are AC.</b> Bus ↔ metro and anything ↔ auto changes are fine.
        </li>
        <li>
          <b>The metro is punctual</b>, so its timetable is trusted as-is: 4 min street → platform, 2 min platform → street, 4 min to change lines.
        </li>
        <li>
          <b>Namma Yatri autos only for the first or last mile</b> — from a place off the network to the nearest useful metro station or bus
          stop, or from the last stop to the door. Never a whole trip by auto, never in the middle, and only up to ~{autoKm} km (straight line).
          Any metro station counts as an auto ↔ metro handover. Time = drive time + 6 min to book and get picked up. Fare ≈ ₹{auto.baseFare} for{" "}
          {auto.baseKm} km + ₹{auto.perKm}/km + ₹{auto.pickup} pickup, {auto.nightMultiplier}× at night. Rides under 800 m are walked instead.
        </li>
        <li>Walking is a straight line × 1.3 at 4.5 km/h.</li>
      </ul>

      <H>Hard rules</H>
      <ul className="list-disc pl-5">{rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <H>Soft preferences</H>
      <ul className="list-disc pl-5">{prefs.map((r) => <li key={r}>{r}</li>)}</ul>
      <H>Rankings</H>
      <p>
        {rankings.join(" · ")}. "Recommended" is earliest arrival after preference penalties; the others are what they say.
      </p>

      <H>Data</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>BMTC: the API behind nammabmtcapp.karnataka.gov.in (unofficial use). ● = a live-tracked bus is assigned.</li>
        <li>
          Metro: BMRCL timetables via <a className="underline" href="https://github.com/Vonter/bmrcl-gtfs">Vonter/bmrcl-gtfs</a> (ODbL);
          intermediate stations interpolated; token/QR fares.
        </li>
        <li>
          Traffic: Google Maps Routes API. The search runs on BMTC times and an optimistic auto estimate; only the top {finalists} routes (plus each
          ranking's winner) get traffic-checked and re-ranked, so every route shown is corrected the same way. Lookups are cached per stretch,
          weekday/weekend and half-hour slot for a week, and capped at {google.limit.toLocaleString("en-IN")} a month to stay in the free tier
          {google.used !== null && <> — <b>{google.used.toLocaleString("en-IN")}</b> used this month</>}. Past the cap, buses keep BMTC times and
          autos keep the rough estimate.
        </li>
        <li>Map and place pins: © OpenStreetMap contributors.</li>
      </ul>

      <H>Install</H>
      <p>On Android Chrome: ⋮ menu → <i>Add to Home screen</i> / <i>Install app</i>.</p>
    </main>
  );
}
