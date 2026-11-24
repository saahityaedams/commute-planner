/** A BMTC bus stop. `id` is BMTC's station id (called `routeid` in their API). */
export interface Stop {
  id: number;
  name: string;
  lat: number;
  lon: number;
}
