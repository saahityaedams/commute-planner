import type { Place } from "~/core/types";
import { busNode } from "~/providers/bmtc.server";
import { metroNode } from "~/providers/metro.server";
import { autoNode } from "~/providers/namma-yatri.server";

/**
 * Your places. Each is one or more Nodes (metro station / bus stop) treated as the same spot;
 * the walk between them is added automatically. Places with several modes are also transfer points.
 * Find ids on /places (bus stop search + metro station list).
 * Keep to ~1 bus stop per place: each BMTC node adds planner calls.
 * Every place also gets an auto pickup point automatically (app.server.ts); a place with only
 * `autoNode(...)` is reachable by Namma Yatri (and onward to metro/bus via the other places).
 */
export const PLACES: Place[] = [
  {
    id: "hebbal-baptist",
    name: "Hebbal (Baptist Hospital)",
    nodes: [busNode({ id: 20694, name: "Hebbala Canara Bank", lat: 13.03577, lon: 77.588985 })],
  },
  {
    id: "mantri",
    name: "Mantri Mall",
    nodes: [metroNode("SPGD"), busNode({ id: 20702, name: "Central (Mantri Mall)", lat: 12.9899, lon: 77.571947 })],
  },
  {
    id: "soap-factory",
    name: "Sandal Soap Factory",
    nodes: [metroNode("SSFY"), busNode({ id: 20796, name: "Govt Soap Factory", lat: 13.01315, lon: 77.553987 })],
  },
  {
    id: "banashankari-metro",
    name: "Banashankari Metro",
    nodes: [metroNode("BSNK"), busNode({ id: 39586, name: "Banashankari Temple", lat: 12.91564, lon: 77.5735 })],
  },
  {
    id: "banashankari-ttmc",
    name: "Banashankari TTMC",
    nodes: [busNode({ id: 20623, name: "Banashankari Bus Station (TTMC)", lat: 12.917153, lon: 77.57305 }), metroNode("BSNK")],
  },
  {
    id: "doddakallasandra",
    name: "Doddakallasandra",
    nodes: [metroNode("KLPK"), busNode({ id: 38362, name: "Doddakallasandra Metro Station", lat: 12.88468, lon: 77.552835 })],
  },
  {
    id: "silk-board",
    name: "Silk Board",
    nodes: [metroNode("SBJT"), busNode({ id: 20704, name: "Central Silk Board", lat: 12.91734, lon: 77.622753 })],
  },
  {
    id: "bommanahalli",
    name: "Bommanahalli",
    nodes: [metroNode("HSRL"), busNode({ id: 21138, name: "Roopena Agrahara", lat: 12.911739, lon: 77.626053 })],
  },
  {
    id: "south-end-circle",
    name: "South End Circle",
    nodes: [metroNode("SECE"), busNode({ id: 22504, name: "South End Circle", lat: 12.936787, lon: 77.579333 })],
  },
  {
    id: "cubbon-park",
    name: "Cubbon Park",
    nodes: [metroNode("CBPK"), busNode({ id: 24741, name: "Cubbon Park Metro Station", lat: 12.980848, lon: 77.597775 })],
  },
  {
    id: "indiranagar",
    name: "Indiranagar Metro",
    nodes: [metroNode("IDN"), busNode({ id: 21921, name: "Indiranagara Double Road", lat: 12.97832, lon: 77.636495 })],
  },
  {
    id: "babai-tiffins-hsr",
    name: "Babai Tiffins (HSR)",
    // 18th Main, Sector 4 (OpenStreetMap node 13546510501); Depot-25 is the closest well-served stop (~180 m).
    nodes: [
      busNode({ id: 20748, name: "Depot-25 HSR Layout", lat: 12.919578, lon: 77.64375 }),
      autoNode("Babai Tiffins (HSR)", 12.91825, 77.64473),
    ],
  },
  {
    id: "beverly-hills",
    name: "Chartered Beverly Hills",
    // Sri Raghavendra Swami Rd, Subramanyapura (OpenStreetMap way 906451656).
    nodes: [autoNode("Chartered Beverly Hills", 12.89137, 77.53924)],
  },
];

