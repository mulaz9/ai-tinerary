/**
 * Minimal in-memory fixed-window rate limiter for API routes.
 *
 * Good enough for a single Node process (the default `next start`): it
 * protects the AI/proxy endpoints from abuse without external deps. If the
 * app is ever deployed on multi-instance/serverless infra, swap this for a
 * shared store (Redis, Upstash, …).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;

function pruneExpired(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when `ok` is false). */
  retryAfterSec: number;
}

/**
 * Counts a hit for `key` and reports whether it exceeds `limit` hits per
 * `windowMs` window.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count <= limit) {
    return { ok: true, retryAfterSec: 0 };
  }
  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Best-effort client identifier for rate limiting (per-IP). */
export function clientKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return `${scope}:${ip}`;
}

/**
 * Convenience guard for route handlers. Returns `null` when the request is
 * allowed, or a ready-to-return 429 payload when the limit is exceeded.
 */
export function rateLimitGuard(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): { status: 429; retryAfterSec: number } | null {
  const result = checkRateLimit(clientKey(req, scope), limit, windowMs);
  if (result.ok) return null;
  return { status: 429, retryAfterSec: result.retryAfterSec };
}
