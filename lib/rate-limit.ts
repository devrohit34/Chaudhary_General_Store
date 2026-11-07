const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, maxRequests = 5, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (current.count >= maxRequests) {
    return true;
  }

  current.count += 1;
  return false;
}
