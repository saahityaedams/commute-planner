import { Form, Link } from "react-router";
import { Header } from "~/components/Header";
import type { Route } from "./+types/metro";
import { METRO_STATIONS, planMetro, stationById } from "~/sources/metro.server";
import { fmtTime, istTodayAt, mins } from "~/lib/time";
import { LineBadge, MetroStationSelect } from "~/components/Metro";

export function meta() {
  return [{ title: "Metro · BMTC commute" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  const from = stationById(q.get("from"));
  const to = stationById(q.get("to"));
  const t = q.get("t") ?? "";
  const base = (t && istTodayAt(t)) || Date.now();
  const journeys = from && to ? planMetro(from.id, to.id, base, 6) : null;
  const stations = METRO_STATIONS.map(({ id, name, lines }) => ({ id, name, lines }));
  return { from: from?.id ?? "", to: to?.id ?? "", t, base, journeys, stations };
}

export default function Metro({ loaderData }: Route.ComponentProps) {
  const { stations, from, to, t, journeys, base } = loaderData;
  return (
    <main className="mx-auto max-w-xl px-4 pb-10 text-zinc-900 dark:text-zinc-100">
      <Header />
      <Form method="get" className="space-y-2" key={`${from}-${to}-${t}`}>
        <MetroStationSelect name="from" stations={stations} defaultValue={from} placeholder="From station" />
        <MetroStationSelect name="to" stations={stations} defaultValue={to} placeholder="To station" />
        <div className="flex gap-2">
          <input
            type="time"
            name="t"
            defaultValue={t}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
          <button className="ml-auto rounded-lg bg-zinc-900 px-5 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            Next trains
          </button>
        </div>
      </Form>

      {journeys && (
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {!journeys.length && <li className="py-3 text-sm text-zinc-500">No more trains today.</li>}
          {journeys.map((j, i) => (
            <li key={i} className="flex gap-4 py-3">
              <div className="w-14 shrink-0 text-right">
                <div className="font-semibold tabular-nums">{fmtTime(j.dep)}</div>
                <div className="text-xs text-zinc-500">in {Math.max(0, mins(j.dep - base))} min</div>
              </div>
              <div className="flex-1 text-sm">
                {j.legs.map((l, k) => (
                  <div key={k}>
                    <LineBadge line={l.line} /> towards {l.headsign} · {l.stops} stop{l.stops === 1 ? "" : "s"} · arrive {l.to}{" "}
                    <b className="tabular-nums">{fmtTime(l.arr)}</b>
                    {k < j.legs.length - 1 && <div className="text-xs text-zinc-500">change at {l.to}</div>}
                  </div>
                ))}
                <div className="text-xs text-zinc-500">{mins(j.arr - j.dep)} min ride</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-zinc-500">
        BMRCL published timetables via{" "}
        <a className="underline" href="https://github.com/Vonter/bmrcl-gtfs">
          Vonter/bmrcl-gtfs
        </a>{" "}
        (ODbL). Intermediate station times are interpolated; allow ~4 min for interchanges.
      </p>
    </main>
  );
}
