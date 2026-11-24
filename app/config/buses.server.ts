/**
 * Routes that are AC even though their number doesn't say so. BMTC's API doesn't flag AC buses,
 * so anything starting "V-" (Vajra) or "KIA-" (Vayu Vajra) counts as AC, plus these.
 * Spacing and case don't matter.
 */
export const AC_ROUTES: string[] = ["500-A"];
