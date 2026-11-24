import type { Route } from "./+types/about";
import { AUTO_RADIUS_M, BUS_VS_CAR, FINALISTS, PLACES, planOptions, preferences } from "~/app.server";
import { NAMMA_YATRI_AUTO } from "~/providers/namma-yatri.server";
import { MONTHLY_LIMIT, googleCallsThisMonth } from "~/sources/google.server";
import { Link } from "react-router";
import { Header } from "~/components/Header";

const list = "space-y-1.5 [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.7em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-faint";

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
    extraKm: (planOptions.extraSegmentRadiusM ?? 0) / 1000,
    finalists: FINALISTS,
    auto: NAMMA_YATRI_AUTO,
  };
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-2.5 mt-10 font-display text-xl text-ink">{children}</h2>
);

export default function About({ loaderData }: Route.ComponentProps) {
  const { places, rules, prefs, rankings, busVsCar, autoKm, extraKm, finalists, auto, google } = loaderData;
  return (
    <main className="mx-auto max-w-xl px-4 pb-14 text-[15px] leading-relaxed text-ink/85">
      <Header />

      <h1 className="mt-2 font-display text-[28px] leading-tight text-ink">A planner for one commute</h1>
      <p className="mt-3">
        Built conversationally with an AI coding agent for one person's Bengaluru commute. It reads unofficial APIs, guesses fares, and bakes in
        my own habits. Below is everything it assumes, so you can tell when it's wrong.
      </p>

      <H>My places</H>
      <ul className="flex flex-wrap gap-1.5">
        {places.map((p) => (
          <li key={p} className="rounded-lg border border-rule bg-surface px-2.5 py-1 text-sm text-ink">{p}</li>
        ))}
      </ul>
      <p className="mt-2.5 text-sm text-muted">
        Every place is also an auto pickup/drop point. Places with metro + bus are transfer points. Add more on{" "}
        <Link to="/places" className="underline underline-offset-4">Places</Link>.
      </p>

      <H>My nuances</H>
      <ul className="space-y-3 [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.7em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-marigold [&_b]:text-ink">
        <li>
          <b>I don't trust BMTC's times.</b> Its planner uses timetables with no traffic (it says 45 min for 28 km from Silk Board to Hebbal at
          6 pm). So each bus leg takes at least Google's traffic-aware driving time for that stretch, scaled to the bus route's length, × {busVsCar}.
          Later legs shift to match. Shown in amber as "+N min traffic".
        </li>
        <li>
          <b>Short hops on any bus are fine; longer rides should be AC</b>: Vajra (V-500CA, V-MF1C…), Vayu Vajra (KIA-…) or express Vajra
          (O EXP V-…). Watch the prefix: 500-A is the ordinary bus and V-500A the Vajra on the same road. This is a preference, not a ban: a long non-AC ride counts as 1.5×
          its minutes beyond 20 when ranking "Recommended", but still shows up.
        </li>
        <li>
          <b>One bus all the way is lovely, but bus → metro → bus is often faster and more predictable.</b> Each change counts as 5 extra
          minutes, and minutes added for traffic count 1.5×, so the metro wins when the road is jammed. A trip can use up to three rides
          (say, a bus to Mantri, the metro to Silk Board, then a bus to the door), but the third only as a short hop starting within
          ~{extraKm} km of the destination.
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
      <ul className={list}>{rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <H>Soft preferences</H>
      <ul className={list}>{prefs.map((r) => <li key={r}>{r}</li>)}</ul>
      <H>Rankings</H>
      <p>
        {rankings.join(", ")}. "Recommended" is earliest arrival after preference penalties; the others are what they say.
      </p>

      <H>Data</H>
      <ul className={`${list} space-y-2`}>
        <li>BMTC: the API behind nammabmtcapp.karnataka.gov.in (unofficial use). A green dot means a live-tracked bus is assigned.</li>
        <li>
          Metro: BMRCL timetables via <a className="underline underline-offset-4" href="https://github.com/Vonter/bmrcl-gtfs">Vonter/bmrcl-gtfs</a> (ODbL);
          intermediate stations interpolated; token/QR fares.
        </li>
        <li>
          Traffic: Google Maps Routes API. The search runs on BMTC times and an optimistic auto estimate; only the top {finalists} routes (plus each
          ranking's winner) get traffic-checked and re-ranked, so every route shown is corrected the same way. Lookups are cached per stretch,
          weekday/weekend and half-hour slot for a week, and capped at {google.limit.toLocaleString("en-IN")} a month to stay in the free tier
          {google.used !== null && <>, and <b className="text-ink">{google.used.toLocaleString("en-IN")}</b> have been used this month</>}. Past the cap, buses keep BMTC times and
          autos keep the rough estimate.
        </li>
        <li>Map and place pins: © OpenStreetMap contributors.</li>
      </ul>

      <H>Install</H>
      <p>On Android Chrome, open the ⋮ menu and choose <i>Add to Home screen</i> or <i>Install app</i>.</p>
    </main>
  );
}
