/**
 * Routes that are AC even though their number doesn't say so. Spacing and case don't matter.
 *
 * BMTC's API doesn't flag AC buses, but its route numbers do: every AC route carries a prefix
 * (see AC_PREFIX in providers/bmtc.server.ts): "V-" Vajra (incl. V-MF metro feeders, V-NICE, V-EXP),
 * "KIA-" Vayu Vajra airport, and "O EXP V-" express Vajra.
 *
 * Careful: many corridors run both kinds under near-identical numbers. BMTC's route list
 * (via bmtcride.in, Oct 2026) has 500-A (ordinary, ~162 trips/day) and V-500A (Vajra, ~67/day)
 * as separate routes, likewise 500-CA / V-500CA and 500-D / V-500D. So a plain "500-A" leg is
 * the ordinary bus; only add a number here if that exact route really runs AC buses.
 */
export const AC_ROUTES: string[] = [];
