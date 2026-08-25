export const CACHE_MAX = 200;

export const cacheKey = (headerMessageId, provider, target) => `${headerMessageId}|${provider}|${target}`;

// Pure: returns a new cache object with `value` stored under `key` (stamped `at: now`),
// evicting the oldest entries so at most `max` remain.
export function cachePut(cache, key, value, now, max = CACHE_MAX) {
  const next = { ...cache, [key]: { ...value, at: now } };
  const keys = Object.keys(next);
  if (keys.length > max) {
    keys.sort((a, b) => next[a].at - next[b].at);
    for (const k of keys.slice(0, keys.length - max)) delete next[k];
  }
  return next;
}
