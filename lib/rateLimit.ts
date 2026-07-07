type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const windowMs = 60_000;
const maxRequests = 20;

export function isRateLimited(key: string) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (now > existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  existing.count += 1;
  return existing.count > maxRequests;
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
