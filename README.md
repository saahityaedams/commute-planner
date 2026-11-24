# Commute Planner

Personal multimodal planner for Bengaluru: **fastest**, **cheapest** and **recommended** way from place A to place B
across BMTC buses, Namma Metro and Namma Yatri autos, including transfers — with bus times corrected for traffic.
Installable as a PWA (Android Chrome → ⋮ → Install app). Cloudflare Workers + React Router v8 (framework mode) + Vite + Tailwind.

> Vibe-coded for one person's commute. See `/about` in the app for the rules and preferences baked in.

```sh
npm install
cp .dev.vars.example .dev.vars   # add GOOGLE_MAPS_API_KEY (Routes API only)
npm run dev            # http://localhost:5173
npm test               # core planner tests
npm run metro:update   # refresh metro timetable from Vonter/bmrcl-gtfs
npx wrangler secret put GOOGLE_MAPS_API_KEY   # once, for prod
npm run deploy         # wrangler deploy
```

## Architecture

```
app/core/        mode-agnostic primitives — no BMTC/metro knowledge
  types.ts         Node, Place, Leg, Itinerary, Provider, Criterion, Constraint, Preference
  planner.ts       chains Providers through transfer Places (bounded DFS, memoised calls); feeder (first/last-mile)
                   providers; refines finalists (e.g. live traffic) and ranks by Criteria
  itinerary.ts     build/chain itineraries, walk legs (merged when adjacent), route signatures
  criteria.ts      fastest, cheapest, fewestChanges, leastWalking
  constraints.ts   hard rules (e.g. no bus→bus unless both AC)
  preferences.ts   soft rules as time penalties + the "recommended" criterion
  retime.ts        retime(itinerary, adjuster): better per-leg estimates; later legs shift
  places.ts        pointNode / withPointMode for go-anywhere modes (autos)
  geo.ts           distance + walking model
app/sources/     raw data access
  bmtc.server.ts   BMTC web API client (same API as nammabmtcapp.karnataka.gov.in)
  metro.server.ts  metro timetable engine (connection scan) over app/data/metro.json
  google.server.ts traffic-aware drive time (Routes API): DO cache, per-request budget, monthly cap; roughDrive
app/providers/   adapters: source → core Provider (+ Node constructors)
  bmtc.server.ts   bus   · busNode(stop)
  metro.server.ts  metro · metroNode("SPGD")
  namma-yatri.server.ts  auto · autoNode(name, lat, lon) · tariff estimate
app/config/places.server.ts   your places (Nodes grouped into named spots)
app/app.server.ts             composition root: providers, places, rules, preferences, bus traffic floor
app/components/  Timeline (steps), RouteMap (Leaflet + OSM), Header
workers/         Worker entry + GoogleRoutesState Durable Object (monthly call cap + 7-day result cache)
app/routes/      / (planner) · /places (find stop ids) · /about (nuances) · /api/stops
```

**Adding a mode** (e.g. Namma Yatri): write a `Provider` in `app/providers/`, add it to `app/app.server.ts`. Every plan then considers it,
alone and chained with the others.

**Adding a place**: search on `/places`, paste the snippet into `app/config/places.server.ts`. Places with several modes become transfer points automatically.

## Data & caveats
- BMTC: schedule-based ETAs from the official planner; ● marks live-tracked buses. The API needs a browser User-Agent.
- Metro: BMRCL published timetables via [Vonter/bmrcl-gtfs](https://github.com/Vonter/bmrcl-gtfs) (ODbL). BMRCL publishes terminal times only, so
  intermediate station times are interpolated. Token/QR fares. No live metro feed exists.
- Traffic: the search uses BMTC times and an optimistic auto estimate; only the top 8 routes (+ each ranking's winner) are
  traffic-checked and re-ranked (~10 Google calls for a new plan, ~0 when cached). Bus leg ≥ drive time × (bus km ÷ drive km) × 1.2.
  Capped at 4,500 calls/month (free tier: 5,000 Compute Routes Pro) by a Durable Object; past it, estimates are kept.
- Autos are first/last-mile only: they bridge an end the bus/metro network doesn't reach (≤ 5 km, 4 nearest handovers;
  every metro station is a handover), never a whole trip.
- Autos: Namma Yatri has no public API — fare is a tariff estimate (₹40/2 km + ₹19/km + ₹10 pickup, 1.5× at night), 6 min to pick up.
- Map: © OpenStreetMap contributors (tile.openstreetmap.org, light personal use).
- Assumptions: 4 min to enter / 2 min to exit a metro station, 4 min metro interchange, walking = straight line × 1.3 at 4.5 km/h.
