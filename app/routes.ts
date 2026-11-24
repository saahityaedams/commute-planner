import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("metro", "routes/metro.tsx"),
  route("places", "routes/places.tsx"),
  route("about", "routes/about.tsx"),
  route("api/stops", "routes/api.stops.ts"),
] satisfies RouteConfig;
