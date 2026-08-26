import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, cachePut, cachedDetected, CACHE_MAX } from '../src/cache.js';

test('cacheKey combines message id, provider and target', () => {
  assert.equal(cacheKey('<abc@x>', 'deepl', 'en'), '<abc@x>|deepl|en');
});

test('cachePut stores the value with a timestamp and does not mutate the input', () => {
  const before = {};
  const after = cachePut(before, 'k', { texts: ['a'] }, 5);
  assert.deepEqual(after, { k: { texts: ['a'], at: 5 } });
  assert.deepEqual(before, {});
});

test('cachePut evicts the oldest entries beyond max', () => {
  let cache = {};
  for (let i = 0; i < 4; i++) cache = cachePut(cache, `k${i}`, {}, i, 3);
  assert.deepEqual(Object.keys(cache).sort(), ['k1', 'k2', 'k3']);
});

test('cachePut overwriting an existing key refreshes its timestamp', () => {
  let cache = cachePut({}, 'a', {}, 1, 2);
  cache = cachePut(cache, 'b', {}, 2, 2);
  cache = cachePut(cache, 'a', {}, 3, 2);
  cache = cachePut(cache, 'c', {}, 4, 2);
  assert.deepEqual(Object.keys(cache).sort(), ['a', 'c']);
});

test('CACHE_MAX is 200', () => {
  assert.equal(CACHE_MAX, 200);
});

test('cachedDetected returns the detected language of a cached Translation of that message', () => {
  const cache = { [cacheKey('<a@x>', 'deepl', 'en')]: { texts: [], detected: 'hr', at: 1 } };
  assert.equal(cachedDetected(cache, '<a@x>'), 'hr');
});

test('cachedDetected ignores other messages, empty detections and a missing id', () => {
  const cache = {
    [cacheKey('<a@x>2', 'deepl', 'en')]: { texts: [], detected: 'de', at: 1 },
    [cacheKey('<b@x>', 'deepl', 'en')]: { texts: [], detected: '', at: 2 },
  };
  assert.equal(cachedDetected(cache, '<a@x>'), undefined);
  assert.equal(cachedDetected(cache, '<b@x>'), undefined);
  assert.equal(cachedDetected(cache, undefined), undefined);
  assert.equal(cachedDetected({}, '<a@x>'), undefined);
});
