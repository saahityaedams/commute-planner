import type { Route } from "./+types/api.stops";
import { searchStops } from "~/sources/bmtc.server";

// GET /api/stops?q=hebbal → { stops: Stop[] }
export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return { stops: await searchStops(q), error: null };
  } catch (e) {
    return { stops: [], error: e instanceof Error ? e.message : "lookup failed" };
  }
}
