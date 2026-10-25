/** Små byggeklodser til den offentlige instans: forsøgsgrænse og cache. Alt ligger i hukommelsen og forsvinder ved genstart. */

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Højst så mange nøgler (IP'er) ad gangen; de ældste smides ud først. */
  maxKeys?: number;
  now?: () => number;
}

/** Fast tidsvindue pr. nøgle. `take` tæller ét kald og siger, om det må komme igennem. */
export const createRateLimiter = ({ limit, windowMs, maxKeys = 10000, now = Date.now }: RateLimiterOptions) => {
  const windows = new Map<string, { count: number; resetAt: number }>();

  const sweep = (t: number) => {
    for (const [key, w] of windows) if (w.resetAt <= t) windows.delete(key);
    // Stadig fuldt: fjern de ældste, så hukommelsen ikke kan vokse ubegrænset.
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  };

  const take = (key: string): { ok: boolean; retryAfterSec: number } => {
    const t = now();
    let w = windows.get(key);
    if (!w || w.resetAt <= t) {
      if (windows.size >= maxKeys) sweep(t);
      w = { count: 0, resetAt: t + windowMs };
      windows.set(key, w);
    }
    w.count++;
    return { ok: w.count <= limit, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - t) / 1000)) };
  };

  return { take };
};

export interface CacheOptions {
  ttlMs: number;
  max: number;
  now?: () => number;
}

/** Cache med levetid og loft, hvor samtidige opslag på samme nøgle deler ét kald. Fejl og tomme svar gemmes ikke. */
export const createCache = <T>({ ttlMs, max, now = Date.now }: CacheOptions) => {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  const get = async (key: string, load: () => Promise<T>, cacheable: (value: T) => boolean = () => true): Promise<T> => {
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
    entries.delete(key);

    const running = inflight.get(key);
    if (running) return running;

    const promise = load()
      .then((value) => {
        if (cacheable(value)) {
          if (entries.size >= max) {
            const oldest = entries.keys().next();
            if (!oldest.done) entries.delete(oldest.value);
          }
          entries.set(key, { value, expiresAt: now() + ttlMs });
        }
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };

  return { get };
};
