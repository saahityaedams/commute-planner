import { DurableObject } from "cloudflare:workers";

/**
 * Durable state for the Google Routes integration (a single global instance):
 *  - a strongly consistent monthly call counter that refuses calls past a limit (free-tier guard);
 *  - a result cache with expiry, which (unlike the Cache API) also works on *.workers.dev.
 */
export class GoogleRoutesState extends DurableObject {
  /** Reserve one call for `month` if that keeps the month at or under `limit`. */
  async take(month: string, limit: number): Promise<boolean> {
    const key = `m:${month}`;
    const used = (await this.ctx.storage.get<number>(key)) ?? 0;
    if (used >= limit) return false;
    await this.ctx.storage.put(key, used + 1);
    return true;
  }

  async used(month: string): Promise<number> {
    return (await this.ctx.storage.get<number>(`m:${month}`)) ?? 0;
  }

  async cacheGet(key: string): Promise<Record<string, unknown> | null> {
    const e = await this.ctx.storage.get<{ exp: number; v: Record<string, unknown> }>(`c:${key}`);
    if (!e) return null;
    if (e.exp < Date.now()) {
      await this.ctx.storage.delete(`c:${key}`);
      return null;
    }
    return e.v;
  }

  async cachePut(key: string, v: Record<string, unknown>, ttlMs: number): Promise<void> {
    await this.ctx.storage.put(`c:${key}`, { exp: Date.now() + ttlMs, v });
  }
}
