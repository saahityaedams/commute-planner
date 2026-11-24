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
    <main className="mx-auto max-w-xl space-y-8 px-4 pb-10 text-zinc-900 dark:text-zinc-100">
      <Header />

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Configured · <code>app/config/places.server.ts</code>
        </h2>
        <ul className="space-y-1 text-sm">
          {places.map((p) => (
            <li key={p.id}>
              <b>{p.name}</b>{" "}
              <span className="text-zinc-500">
                {p.nodes.map((n) => `${n.mode}: ${n.name} (${n.ref})`).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Find a bus stop</h2>
        <Form method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. hebbal (3+ letters)"
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">Search</button>
        </Form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <ul className="mt-3 space-y-3">
          {results.map(({ stop, metro }) => (
            <li key={stop.id} className="text-sm">
              <div>
                <b>{stop.name}</b> <span className="text-zinc-500">#{stop.id}</span>
                {metro && (
                  <span className="text-zinc-500">
                    {" "}
                    · {metro.distM} m from {metro.name} metro ({metro.id})
                  </span>
                )}
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">{snippet(stop, metro)}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Metro stations</h2>
        <div className="columns-2 text-xs text-zinc-600 dark:text-zinc-400">
          {stations.map((s) => (
            <div key={s.id}>
              <code>{s.id}</code> {s.name}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
