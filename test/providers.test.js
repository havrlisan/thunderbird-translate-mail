import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, chunk, translateAll, LIMITS } from '../src/providers.js';

// Fake fetch: records calls, answers with the given JSON body.
function fakeFetch(body, status = 200) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, json: init.body ? JSON.parse(init.body) : null });
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

test('chunk splits by item count and by character budget', () => {
  assert.deepEqual(chunk(['a', 'b', 'c'], { maxItems: 2, maxChars: 100 }), [['a', 'b'], ['c']]);
  assert.deepEqual(chunk(['aaaa', 'bbbb', 'cc'], { maxItems: 10, maxChars: 6 }), [['aaaa'], ['bbbb', 'cc']]);
  assert.deepEqual(chunk([], LIMITS), []);
  assert.deepEqual(chunk(['x'.repeat(50)], { maxItems: 1, maxChars: 10 }), [['x'.repeat(50)]]);
});

test('every provider declares name and credential fields', () => {
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ['deepl', 'google', 'microsoft', 'yandex']);
  assert.deepEqual(PROVIDERS.google.fields, ['apiKey']);
  assert.deepEqual(PROVIDERS.microsoft.fields, ['apiKey', 'region']);
  assert.deepEqual(PROVIDERS.deepl.fields, ['apiKey']);
  assert.deepEqual(PROVIDERS.yandex.fields, ['apiKey', 'folderId']);
});

test('google: request shape and response mapping', async () => {
  const f = fakeFetch({ data: { translations: [
    { translatedText: 'Hello', detectedSourceLanguage: 'de' },
    { translatedText: 'World', detectedSourceLanguage: 'de' },
  ] } });
  const r = await PROVIDERS.google.translate(['Hallo', 'Welt'], 'en', { apiKey: 'K' }, f);
  assert.deepEqual(r, { texts: ['Hello', 'World'], detected: 'de' });
  assert.equal(f.calls[0].url, 'https://translation.googleapis.com/language/translate/v2?key=K');
  assert.deepEqual(f.calls[0].json, { q: ['Hallo', 'Welt'], target: 'en', format: 'text' });
});

test('microsoft: request shape and response mapping', async () => {
  const f = fakeFetch([
    { detectedLanguage: { language: 'de', score: 1 }, translations: [{ text: 'Hello', to: 'en' }] },
    { detectedLanguage: { language: 'de', score: 1 }, translations: [{ text: 'World', to: 'en' }] },
  ]);
  const r = await PROVIDERS.microsoft.translate(['Hallo', 'Welt'], 'en', { apiKey: 'K', region: 'westeurope' }, f);
  assert.deepEqual(r, { texts: ['Hello', 'World'], detected: 'de' });
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en');
  assert.equal(c.init.headers['Ocp-Apim-Subscription-Key'], 'K');
  assert.equal(c.init.headers['Ocp-Apim-Subscription-Region'], 'westeurope');
  assert.deepEqual(c.json, [{ Text: 'Hallo' }, { Text: 'Welt' }]);
});

test('deepl: free keys go to api-free host, target codes are upper-cased with EN/PT variants', async () => {
  const f = fakeFetch({ translations: [{ detected_source_language: 'DE', text: 'Hello' }] });
  const r = await PROVIDERS.deepl.translate(['Hallo'], 'en', { apiKey: 'abc:fx' }, f);
  assert.deepEqual(r, { texts: ['Hello'], detected: 'de' });
  const c = f.calls[0];
  assert.equal(c.url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(c.init.headers.Authorization, 'DeepL-Auth-Key abc:fx');
  assert.deepEqual(c.json, { text: ['Hallo'], target_lang: 'EN-US' });

  const g = fakeFetch({ translations: [{ detected_source_language: 'EN', text: 'Olá' }] });
  await PROVIDERS.deepl.translate(['Hello'], 'pt', { apiKey: 'abc' }, g);
  assert.equal(g.calls[0].url, 'https://api.deepl.com/v2/translate');
  assert.equal(g.calls[0].json.target_lang, 'PT-PT');

  const h = fakeFetch({ translations: [{ detected_source_language: 'EN', text: 'Hallo' }] });
  await PROVIDERS.deepl.translate(['Hello'], 'de', { apiKey: 'abc' }, h);
  assert.equal(h.calls[0].json.target_lang, 'DE');
});

test('yandex: request shape and response mapping', async () => {
  const f = fakeFetch({ translations: [{ text: 'Hello', detectedLanguageCode: 'de' }] });
  const r = await PROVIDERS.yandex.translate(['Hallo'], 'en', { apiKey: 'K', folderId: 'F' }, f);
  assert.deepEqual(r, { texts: ['Hello'], detected: 'de' });
  const c = f.calls[0];
  assert.equal(c.url, 'https://translate.api.cloud.yandex.net/translate/v2/translate');
  assert.equal(c.init.headers.Authorization, 'Api-Key K');
  assert.deepEqual(c.json, { folderId: 'F', texts: ['Hallo'], targetLanguageCode: 'en' });
});

test('HTTP errors become an Error with status and body excerpt', async () => {
  const f = fakeFetch({ message: 'Invalid key' }, 403);
  await assert.rejects(
    PROVIDERS.google.translate(['x'], 'en', { apiKey: 'bad' }, f),
    (e) => e.message.startsWith('HTTP 403') && e.message.includes('Invalid key'),
  );
});

test('translateAll chunks, concatenates and normalises detected language', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    const q = JSON.parse(init.body).q;
    calls.push(q.length);
    return { ok: true, status: 200, json: async () => ({ data: { translations: q.map((s) => ({ translatedText: s.toUpperCase(), detectedSourceLanguage: 'zh-CN' })) } }) };
  };
  const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);
  const r = await translateAll('google', texts, 'en', { apiKey: 'K' }, fetchFn);
  assert.deepEqual(calls, [50, 50, 20]);
  assert.equal(r.texts.length, 120);
  assert.equal(r.texts[119], 'T119');
  assert.equal(r.detected, 'zh');
});

test('translateAll with no texts makes no calls and returns empty detected', async () => {
  const r = await translateAll('google', [], 'en', { apiKey: 'K' }, async () => { throw new Error('should not be called'); });
  assert.deepEqual(r, { texts: [], detected: '' });
});
