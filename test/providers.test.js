import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, chunk, translateAll, keepEnding, LIMITS, errorKey } from '../src/providers.js';

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

test('google: request shape, response mapping, detection from the longest text', async () => {
  const f = fakeFetch({ data: { translations: [
    { translatedText: 'Hi', detectedSourceLanguage: 'nl' },
    { translatedText: 'Hello world and more', detectedSourceLanguage: 'de' },
  ] } });
  const r = await PROVIDERS.google.translate(['Hoi', 'Hallo Welt und mehr'], 'en', { apiKey: 'K' }, f);
  assert.deepEqual(r, { texts: ['Hi', 'Hello world and more'], detected: 'de' });
  assert.equal(f.calls[0].url, 'https://translation.googleapis.com/language/translate/v2?key=K');
  assert.deepEqual(f.calls[0].json, { q: ['Hoi', 'Hallo Welt und mehr'], target: 'en', format: 'text' });
});

test('google: HTML entities are decoded and nb maps to no', async () => {
  const f = fakeFetch({ data: { translations: [
    { translatedText: 'Tom&#39;s cat &amp; dog &lt;b&gt; &quot;x&quot;', detectedSourceLanguage: 'de' },
  ] } });
  const r = await PROVIDERS.google.translate(['x'], 'nb', { apiKey: 'K' }, f);
  assert.deepEqual(r.texts, [`Tom's cat & dog <b> "x"`]);
  assert.equal(f.calls[0].json.target, 'no');

  const g = fakeFetch({ data: { translations: [{ translatedText: 'y', detectedSourceLanguage: 'de' }] } });
  await PROVIDERS.google.translate(['x'], 'en', { apiKey: 'K' }, g, 'nb');
  assert.equal(g.calls[0].json.source, 'no');
});

test('microsoft: request shape, response mapping, detection from the longest text', async () => {
  const f = fakeFetch([
    { detectedLanguage: { language: 'nl', score: 1 }, translations: [{ text: 'Hi', to: 'en' }] },
    { detectedLanguage: { language: 'de', score: 1 }, translations: [{ text: 'Hello world and more', to: 'en' }] },
  ]);
  const r = await PROVIDERS.microsoft.translate(['Hoi', 'Hallo Welt und mehr'], 'en', { apiKey: 'K', region: 'westeurope' }, f);
  assert.deepEqual(r, { texts: ['Hi', 'Hello world and more'], detected: 'de' });
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en');
  assert.equal(c.init.headers['Ocp-Apim-Subscription-Key'], 'K');
  assert.equal(c.init.headers['Ocp-Apim-Subscription-Region'], 'westeurope');
  assert.deepEqual(c.json, [{ Text: 'Hoi' }, { Text: 'Hallo Welt und mehr' }]);

  const g = fakeFetch([{ detectedLanguage: { language: 'en', score: 1 }, translations: [{ text: '你好', to: 'zh-Hans' }] }]);
  await PROVIDERS.microsoft.translate(['Hello'], 'zh', { apiKey: 'K', region: 'westeurope' }, g);
  assert.equal(g.calls[0].url, 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-Hans');

  const h = fakeFetch([{ translations: [{ text: 'x', to: 'en' }] }]);
  await PROVIDERS.microsoft.translate(['x'], 'en', { apiKey: 'K', region: 'westeurope' }, h, 'sr');
  assert.equal(h.calls[0].url, 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en&from=sr-Latn');
});

test('deepl: free keys go to api-free host, target codes are upper-cased with EN/PT variants', async () => {
  const f = fakeFetch({ translations: [
    { detected_source_language: 'NL', text: 'Hi' },
    { detected_source_language: 'DE', text: 'Hello world and more' },
  ] });
  const r = await PROVIDERS.deepl.translate(['Hoi', 'Hallo Welt und mehr'], 'en', { apiKey: 'abc:fx' }, f);
  assert.deepEqual(r, { texts: ['Hi', 'Hello world and more'], detected: 'de' }); // longest text wins
  const c = f.calls[0];
  assert.equal(c.url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(c.init.headers.Authorization, 'DeepL-Auth-Key abc:fx');
  assert.deepEqual(c.json, { text: ['Hoi', 'Hallo Welt und mehr'], target_lang: 'EN-US' });

  const g = fakeFetch({ translations: [{ detected_source_language: 'EN', text: 'Olá' }] });
  await PROVIDERS.deepl.translate(['Hello'], 'pt', { apiKey: 'abc' }, g);
  assert.equal(g.calls[0].url, 'https://api.deepl.com/v2/translate');
  assert.equal(g.calls[0].json.target_lang, 'PT-PT');

  const h = fakeFetch({ translations: [{ detected_source_language: 'EN', text: 'Hallo' }] });
  await PROVIDERS.deepl.translate(['Hello'], 'de', { apiKey: 'abc' }, h);
  assert.equal(h.calls[0].json.target_lang, 'DE');

  const i = fakeFetch({ translations: [{ detected_source_language: 'EN', text: 'Hallo' }] });
  await PROVIDERS.deepl.translate(['Hello'], 'de', { apiKey: 'abc' }, i, 'en');
  assert.deepEqual(i.calls[0].json, { text: ['Hello'], target_lang: 'DE', source_lang: 'EN' });
});

test('yandex: request shape, response mapping, detection from the longest text', async () => {
  const f = fakeFetch({ translations: [
    { text: 'Hi', detectedLanguageCode: 'nl' },
    { text: 'Hello world and more', detectedLanguageCode: 'de' },
  ] });
  const r = await PROVIDERS.yandex.translate(['Hoi', 'Hallo Welt und mehr'], 'en', { apiKey: 'K', folderId: 'F' }, f);
  assert.deepEqual(r, { texts: ['Hi', 'Hello world and more'], detected: 'de' });
  const c = f.calls[0];
  assert.equal(c.url, 'https://translate.api.cloud.yandex.net/translate/v2/translate');
  assert.equal(c.init.headers.Authorization, 'Api-Key K');
  assert.deepEqual(c.json, { folderId: 'F', texts: ['Hoi', 'Hallo Welt und mehr'], targetLanguageCode: 'en' });

  const g = fakeFetch({ translations: [{ text: 'Hei', detectedLanguageCode: 'en' }] });
  await PROVIDERS.yandex.translate(['Hello'], 'nb', { apiKey: 'K', folderId: 'F' }, g);
  assert.equal(g.calls[0].json.targetLanguageCode, 'no');

  const h = fakeFetch({ translations: [{ text: 'x', detectedLanguageCode: 'nb' }] });
  await PROVIDERS.yandex.translate(['x'], 'en', { apiKey: 'K', folderId: 'F' }, h, 'nb');
  assert.equal(h.calls[0].json.sourceLanguageCode, 'no');
});

test('HTTP errors become an Error with status and body excerpt', async () => {
  const f = fakeFetch({ message: 'Invalid key' }, 403);
  await assert.rejects(
    PROVIDERS.google.translate(['x'], 'en', { apiKey: 'bad' }, f),
    (e) => e.status === 403 && e.message.startsWith('HTTP 403') && e.message.includes('Invalid key'),
  );
});

test('fetch rejections are tagged as network errors', async () => {
  const f = async () => { throw new TypeError('NetworkError when attempting to fetch resource.'); };
  await assert.rejects(PROVIDERS.deepl.translate(['x'], 'en', { apiKey: 'k:fx' }, f), (e) => e.network === true);
});

test('translateAll detects on the longest text alone, then translates the rest with the source pinned', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ q: body.q, source: body.source });
    return { ok: true, status: 200, json: async () => ({ data: { translations: body.q.map((s) => ({ translatedText: s.toUpperCase(), detectedSourceLanguage: body.source ?? 'de' })) } }) };
  };
  const r = await translateAll('google', ['Hi', 'Hallo Welt und mehr', 'bold'], 'en', { apiKey: 'K' }, fetchFn);
  assert.deepEqual(calls, [{ q: ['Hallo Welt und mehr'], source: undefined }, { q: ['Hi', 'bold'], source: 'de' }]);
  assert.deepEqual(r, { texts: ['HI', 'HALLO WELT UND MEHR', 'BOLD'], detected: 'de' });
});

test('translateAll chunks the pinned round and keeps every text in place', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    const q = JSON.parse(init.body).q;
    calls.push(q.length);
    return { ok: true, status: 200, json: async () => ({ data: { translations: q.map((s) => ({ translatedText: s.toUpperCase(), detectedSourceLanguage: 'zh-CN' })) } }) };
  };
  const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);
  texts[110] = 'x'.repeat(100);
  const r = await translateAll('google', texts, 'en', { apiKey: 'K' }, fetchFn);
  assert.deepEqual(calls, [1, 50, 50, 19]);
  assert.equal(r.texts.length, 120);
  assert.equal(r.texts[0], 'T0');
  assert.equal(r.texts[110], 'X'.repeat(100));
  assert.equal(r.texts[119], 'T119');
  assert.equal(r.detected, 'zh');
});

test('translateAll skips the second round when the text is already in the Target Language', async () => {
  let calls = 0;
  const fetchFn = async (url, init) => {
    calls++;
    const q = JSON.parse(init.body).q;
    return { ok: true, status: 200, json: async () => ({ data: { translations: q.map((s) => ({ translatedText: s.toUpperCase(), detectedSourceLanguage: 'en' })) } }) };
  };
  const r = await translateAll('google', ['Hello there my friend', 'Hi'], 'en', { apiKey: 'K' }, fetchFn);
  assert.equal(calls, 1);
  assert.deepEqual(r, { texts: ['HELLO THERE MY FRIEND', 'Hi'], detected: 'en' });
});

test('translateAll rejects when a provider returns fewer translations than requested', async () => {
  const fetchFn = async (url, init) => {
    const q = JSON.parse(init.body).q;
    return { ok: true, status: 200, json: async () => ({ data: { translations: q.slice(1).map((s) => ({ translatedText: s.toUpperCase(), detectedSourceLanguage: 'de' })) } }) };
  };
  await assert.rejects(
    translateAll('google', ['Hallo', 'Welt'], 'en', { apiKey: 'K' }, fetchFn),
    (e) => e.message.includes('1 texts') && e.message.includes('0 translations'),
  );
});

test('translateAll with no texts makes no calls and returns empty detected', async () => {
  const r = await translateAll('google', [], 'en', { apiKey: 'K' }, async () => { throw new Error('should not be called'); });
  assert.deepEqual(r, { texts: [], detected: '' });
});

test('errorKey maps HTTP status / network failures to the i18n message key', () => {
  assert.equal(errorKey({ status: 401 }, 'deepl'), 'errorAuth');
  assert.equal(errorKey({ status: 403 }, 'microsoft'), 'errorAuthMicrosoft');
  assert.equal(errorKey({ status: 429 }, 'google'), 'errorQuota');
  assert.equal(errorKey({ status: 456 }, 'deepl'), 'errorQuota');
  assert.equal(errorKey({ status: 500 }, 'deepl'), 'errorHttp');
  assert.equal(errorKey({ network: true }, 'deepl'), 'errorNetwork');
  assert.equal(errorKey(new Error('x'), 'deepl'), 'errorGeneric');
});

test('keepEnding restores trailing punctuation the Provider dropped', () => {
  assert.equal(keepEnding('Hello,', 'Pozdrav'), 'Pozdrav,');
  assert.equal(keepEnding('part of the text.', 'dio teksta'), 'dio teksta.');
  assert.equal(keepEnding('Wait...', 'Čekaj'), 'Čekaj...');
  assert.equal(keepEnding('Hello,', 'Pozdrav,'), 'Pozdrav,');
  assert.equal(keepEnding('Really?', '本当に？'), '本当に？');
  assert.equal(keepEnding('Hello', 'Pozdrav'), 'Pozdrav');
  assert.equal(keepEnding('"Hi."', 'Bok'), 'Bok');
});
