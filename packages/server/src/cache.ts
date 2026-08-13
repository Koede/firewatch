/**
 * A small in-memory TTL cache with stale-while-revalidate semantics.
 *
 * Agency GIS endpoints are slow (multi-second) and rate-limited, and a wildfire
 * map is read-heavy with many clients wanting the same national extent. Serving
 * a slightly stale response instantly, then refreshing in the background, beats
 * making every client wait for the upstream round trip.
 */

interface CacheEntry<T> {
  value: T;
  /** When the value was stored, epoch ms. */
  storedAt: number;
  /** When the value stops being fresh, epoch ms. */
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  staleServes: number;
  entries: number;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  /** In-flight refreshes, so concurrent misses collapse into one upstream call. */
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly stats: CacheStats = { hits: 0, misses: 0, staleServes: 0, entries: 0 };

  /**
   * Return the cached value, refreshing through `loader` when it has expired.
   *
   * When a stale value exists and the refresh fails, the stale value is served
   * rather than propagating the error — a slightly old fire perimeter is far
   * more useful than an error page.
   */
  async get<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<{ value: T; storedAt: number; fromCache: boolean; stale: boolean }> {
    const now = Date.now();
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (entry && now < entry.expiresAt) {
      this.stats.hits += 1;
      return { value: entry.value, storedAt: entry.storedAt, fromCache: true, stale: false };
    }

    this.stats.misses += 1;

    // Collapse concurrent refreshes of the same key onto one upstream request.
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      try {
        const value = await existing;
        return { value, storedAt: Date.now(), fromCache: true, stale: false };
      } catch (error) {
        if (entry) {
          this.stats.staleServes += 1;
          return { value: entry.value, storedAt: entry.storedAt, fromCache: true, stale: true };
        }
        throw error;
      }
    }

    const promise = loader()
      .then((value) => {
        this.set(key, value, ttlSeconds);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);

    try {
      const value = await promise;
      return { value, storedAt: Date.now(), fromCache: false, stale: false };
    } catch (error) {
      if (entry) {
        // Upstream is down but we have something. Serve it and mark it stale.
        this.stats.staleServes += 1;
        return { value: entry.value, storedAt: entry.storedAt, fromCache: true, stale: true };
      }
      throw error;
    }
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    const now = Date.now();
    this.store.set(key, { value, storedAt: now, expiresAt: now + ttlSeconds * 1000 });
    this.stats.entries = this.store.size;
  }

  peek<T>(key: string): CacheEntry<T> | undefined {
    return this.store.get(key) as CacheEntry<T> | undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
    this.stats.entries = this.store.size;
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.stats.entries = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats, entries: this.store.size };
  }
}

export const cache = new TtlCache();
