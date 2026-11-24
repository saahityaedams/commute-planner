import { Form, Link } from "react-router";
import { Header } from "~/components/Header";
import type { Route } from "./+types/places";
import { PLACES } from "~/config/places.server";
import { searchStops } from "~/sources/bmtc.server";
import { METRO_STATIONS, nearestStation } from "~/sources/metro.server";

export function meta() {
  return [{ title: "Places · Commute" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  let error: string | null = null;
  const stops = await searchStops(q).catch((e) => ((error = String(e)), []));
  return {
    q,
    error,
    places: PLACES,
    results: stops.map((s) => {
      const near = nearestStation(s.lat, s.lon, 1000);
      return { stop: s, metro: near && { id: near.station.id, name: near.station.name, distM: Math.round(near.distM) } };
    }),
    stations: METRO_STATIONS.map(({ id, name, lines }) => ({ id, name, lines })),
  };
}

function snippet(stop: { id: number; name: string; lat: number; lon: number }, metro: { id: string } | null) {
  const slug = stop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const nodes = [
    metro && `metroNode("${metro.id}")`,
    `busNode({ id: ${stop.id}, name: ${JSON.stringify(stop.name)}, lat: ${stop.lat}, lon: ${stop.lon} })`,
  ].filter(Boolean);
  return `{\n  id: "${slug}",\n  name: ${JSON.stringify(stop.name)},\n  nodes: [${nodes.join(", ")}],\n},`;
}

export default function Places({ loaderData }: Route.ComponentProps) {
  const { q, error, places, results, stations } = loaderData;
  return (
    <main className="mx-auto max-w-xl space-y-10 px-4 pb-14">
      <Header />

      <section>
        <h2 className="font-display text-xl">Configured places</h2>
        <p className="mb-3 text-sm text-muted">
          Edit in <code className="text-ink">app/config/places.server.ts</code>
        </p>
        <ul className="space-y-1.5 text-sm">
          {places.map((p) => (
            <li key={p.id}>
              <b>{p.name}</b>{" "}
              <span className="text-muted">
                {p.nodes.map((n) => `${n.mode}: ${n.name} (${n.ref})`).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Find a bus stop</h2>
        <Form method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. hebbal (3+ letters)"
            className="min-w-0 flex-1 rounded-[10px] border border-rule bg-surface px-3 py-2 outline-none focus:border-ink"
          />
          <button className="rounded-[10px] bg-ink px-4 py-2 font-bold text-paper">Search</button>
        </Form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <ul className="mt-3 space-y-3">
          {results.map(({ stop, metro }) => (
            <li key={stop.id} className="text-sm">
              <div>
                <b>{stop.name}</b> <span className="text-muted">#{stop.id}</span>
                {metro && (
                  <span className="text-muted">
                    {", "}
                    {metro.distM} m from {metro.name} metro ({metro.id})
                  </span>
                )}
              </div>
              <pre className="mt-1.5 overflow-x-auto rounded-lg border border-rule bg-surface p-2.5 text-xs">{snippet(stop, metro)}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Metro station codes</h2>
        <div className="columns-2 text-xs text-muted">
          {stations.map((s) => (
            <div key={s.id}>
              <code className="text-ink">{s.id}</code> {s.name}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
