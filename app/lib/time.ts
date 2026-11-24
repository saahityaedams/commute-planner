// All times are epoch ms (real instants). BMTC speaks IST wall-clock strings.
const IST_OFFSET_MS = 330 * 60_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** "11/23/2026 15:05:00" (IST) → epoch ms */
export function parseBmtcTime(s: string): number {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  const [, mo, d, y, h, mi, se] = m.map(Number) as number[];
  return Date.UTC(y, mo - 1, d, h, mi, se || 0) - IST_OFFSET_MS;
}

/** epoch ms → "2026-11-23 18:30:00" (IST) */
export function toBmtcDateTime(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

/** "18:30" today in IST → epoch ms (rolls to tomorrow if already >1h past) */
export function istTodayAt(hhmm: string, now = Date.now()): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const today = new Date(now + IST_OFFSET_MS);
  let t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), +m[1], +m[2]) - IST_OFFSET_MS;
  if (t < now - 3600_000) t += 86_400_000;
  return t;
}

/** epoch ms → "18:30" in IST (same output on server and client) */
export function fmtTime(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const mins = (ms: number) => Math.round(ms / 60_000);
