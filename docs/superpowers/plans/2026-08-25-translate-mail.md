# Translate Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Thunderbird MV3 add-on with a header-toolbar button that translates the displayed message (subject + body, in place, toggleable) into a configured Target Language via the user's chosen Provider (Google / Microsoft / DeepL / Yandex).

**Architecture:** `background.js` (ES module) owns the button, storage, cache and Provider calls; `content.js` (classic script, injected on click together with `text.js`) collects the message's text nodes and rewrites them in place; `providers.js`/`cache.js`/`text.js` are pure and unit-tested with `node --test`. No build step; the repo *is* the add-on.

**Tech Stack:** Thunderbird MailExtension API (MV3, `messenger.*`), plain ES2022 JavaScript, Node 24 `node --test` for unit tests, no dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-translate-mail-design.md` (glossary in `CONTEXT.md`).

## Global Constraints

- `manifest_version: 3`, `browser_specific_settings.gecko.id = "translate-mail@luka-havrlisan"`, `strict_min_version = "128.0"`.
- Plain JS, **no dependencies, no bundler, no TypeScript**. `package.json` exists only for `"type": "module"` and the `test` script.
- All user-visible strings go through `_locales/en/messages.json` (`messenger.i18n.getMessage`). No hard-coded UI text in JS/HTML.
- Use the `messenger` global (not `browser`/`chrome`) in extension code; the content script alone uses `globalThis.messenger ?? globalThis.browser`.
- Vocabulary from `CONTEXT.md`: Provider, Target Language, Source Language, Translation, Original. Never "service"/"engine".
- Markup is never sent to a Provider — only trimmed text-node strings.
- Commit after every task; never push.
- Files that must be loadable by both Node tests and the extension: `src/providers.js`, `src/cache.js` (ES modules with `export`), `src/text.js` (classic script that assigns `globalThis.TM_TEXT` — content scripts cannot `import`).
- Run tests with `npm test` from the repo root (`node --test`), which picks up `test/*.test.js`.

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | `"type": "module"`, `npm test` → `node --test` |
| `manifest.json` | MV3 manifest, permissions, host permissions, button, options page |
| `_locales/en/messages.json` | All UI strings |
| `icons/translate.svg` | Button icon |
| `src/text.js` | Pure text-node helpers shared by content script and tests (`globalThis.TM_TEXT`) |
| `src/providers.js` | `PROVIDERS` table (4 Providers), `chunk`, `translateAll` |
| `src/cache.js` | `cacheKey`, `cachePut` (bounded, oldest-evicted) |
| `src/content.js` | Injected into the displayed message: collect / apply / restore / toggle |
| `src/background.js` | Button click flow, per-tab state, storage, Provider call, cache |
| `src/languages.js` | Static Target Language code list |
| `src/options.html`, `src/options.js` | Options page |
| `test/text.test.js`, `test/cache.test.js`, `test/providers.test.js` | Unit tests |
| `README.md` | Install, credentials per Provider, packaging |

---

### Task 1: Scaffold (manifest, locale, icon, package.json)

**Files:**
- Create: `package.json`, `.gitignore`, `manifest.json`, `_locales/en/messages.json`, `icons/translate.svg`

**Interfaces:**
- Produces: manifest keys later tasks rely on — background `src/background.js` (module), `message_display_action`, `options_ui` → `src/options.html`, permissions `messagesRead`, `scripting`, `storage`, host permissions for the 5 Provider hosts. Locale keys listed below (exact names used by Tasks 5–6).

- [ ] **Step 1: Create `package.json` and `.gitignore`**

`package.json`:
```json
{
  "name": "translate-mail",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

`.gitignore`:
```
node_modules/
*.zip
*.xpi
```

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "version": "0.1.0",
  "author": "Luka Havrlisan",
  "default_locale": "en",
  "browser_specific_settings": {
    "gecko": {
      "id": "translate-mail@luka-havrlisan",
      "strict_min_version": "128.0"
    }
  },
  "background": {
    "scripts": ["src/background.js"],
    "type": "module"
  },
  "message_display_action": {
    "default_title": "__MSG_translate__",
    "default_icon": "icons/translate.svg"
  },
  "options_ui": {
    "page": "src/options.html"
  },
  "permissions": ["messagesRead", "scripting", "storage"],
  "host_permissions": [
    "https://translation.googleapis.com/*",
    "https://api.cognitive.microsofttranslator.com/*",
    "https://api-free.deepl.com/*",
    "https://api.deepl.com/*",
    "https://translate.api.cloud.yandex.net/*"
  ]
}
```

- [ ] **Step 3: Create `_locales/en/messages.json`**

```json
{
  "extName": { "message": "Translate Mail" },
  "extDescription": { "message": "Translate the message you are reading into your language using Google, Microsoft, DeepL or Yandex." },
  "translate": { "message": "Translate" },
  "showOriginal": { "message": "Show original" },
  "translating": { "message": "Translating…" },
  "alreadyIn": { "message": "Already in $LANG$", "placeholders": { "LANG": { "content": "$1" } } },
  "nothingToTranslate": { "message": "Nothing to translate" },
  "error": { "message": "Translation failed" },
  "subjectLine": { "message": "Subject: $SUBJECT$", "placeholders": { "SUBJECT": { "content": "$1" } } },
  "optProvider": { "message": "Provider" },
  "optTarget": { "message": "Translate into" },
  "clearCache": { "message": "Clear translation cache" },
  "cacheCleared": { "message": "Cache cleared" },
  "field_apiKey": { "message": "API key" },
  "field_region": { "message": "Azure region (e.g. westeurope)" },
  "field_folderId": { "message": "Yandex Cloud folder ID" },
  "optionsHint": { "message": "Settings are saved automatically. Message text is sent to the selected Provider only when you click Translate." }
}
```

- [ ] **Step 4: Create `icons/translate.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="context-fill" fill-opacity="context-fill-opacity">
  <path d="M1 2h6v1.5H5.6c-.3 1.6-1 3-1.9 4.1.6.5 1.3.9 2 1.2l-.5 1.4c-.9-.3-1.7-.8-2.4-1.5-.7.7-1.5 1.2-2.4 1.5L0 8.8c.7-.3 1.4-.7 2-1.2C1.4 6.8 1 6 .8 5.2h1.5c.2.5.5 1 .8 1.4.6-.8 1.1-1.8 1.3-3.1H1z"/>
  <path d="M10.5 6h1.7L16 15h-1.7l-.9-2.5h-3.7L8.8 15H7.1zm-.3 5h2.8L11.6 7.5z"/>
</svg>
```

- [ ] **Step 5: Verify JSON validity**

Run: `node -e "for (const f of ['package.json','manifest.json','_locales/en/messages.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore manifest.json _locales icons CONTEXT.md docs
git commit -m "Scaffold Translate Mail add-on"
```

---

### Task 2: Text-node helpers (`src/text.js`)

**Files:**
- Create: `src/text.js`
- Test: `test/text.test.js`

**Interfaces:**
- Produces: `globalThis.TM_TEXT = { splitWhitespace(s) → [lead, core, trail], shouldTranslate(s) → boolean, SKIP_TAGS: Set<string> }`. `src/text.js` is a **classic script** (no `import`/`export`); tests load it for its side effect.

- [ ] **Step 1: Write the failing test**

`test/text.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/text.js';

const { splitWhitespace, shouldTranslate, SKIP_TAGS } = globalThis.TM_TEXT;

test('splitWhitespace keeps leading/trailing whitespace separate from the core', () => {
  assert.deepEqual(splitWhitespace('  Hallo Welt \n'), ['  ', 'Hallo Welt', ' \n']);
  assert.deepEqual(splitWhitespace('Hallo'), ['', 'Hallo', '']);
  assert.deepEqual(splitWhitespace('   '), ['   ', '', '']);
});

test('shouldTranslate accepts strings containing a letter in any script', () => {
  assert.equal(shouldTranslate('Hallo'), true);
  assert.equal(shouldTranslate('  こんにちは '), true);
  assert.equal(shouldTranslate('Привет'), true);
});

test('shouldTranslate rejects whitespace, numbers and punctuation-only strings', () => {
  assert.equal(shouldTranslate('   \n'), false);
  assert.equal(shouldTranslate('12345'), false);
  assert.equal(shouldTranslate('---'), false);
  assert.equal(shouldTranslate(''), false);
});

test('SKIP_TAGS covers non-visible text containers', () => {
  for (const tag of ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']) assert.ok(SKIP_TAGS.has(tag), tag);
  assert.ok(!SKIP_TAGS.has('P'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/text.test.js`
Expected: FAIL (cannot find `../src/text.js`)

- [ ] **Step 3: Write minimal implementation**

`src/text.js`:
```js
// Classic script (no import/export): injected into the message before content.js,
// and loaded by tests for its side effect on globalThis.
globalThis.TM_TEXT = {
  // 'Hello ' -> ['', 'Hello', ' ']. Providers strip surrounding whitespace, so we
  // send the core and re-attach lead/trail when writing the translation back.
  splitWhitespace(s) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    return [m[1], m[2], m[3]];
  },
  // Only strings containing a letter are worth a Provider call.
  shouldTranslate(s) {
    return /\p{L}/u.test(s);
  },
  // Text inside these elements is never visible prose.
  SKIP_TAGS: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/text.test.js`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add src/text.js test/text.test.js
git commit -m "Add text-node helpers"
```

---

### Task 3: Cache (`src/cache.js`)

**Files:**
- Create: `src/cache.js`
- Test: `test/cache.test.js`

**Interfaces:**
- Produces: `cacheKey(headerMessageId, provider, target) → string`, `cachePut(cache, key, value, now, max = CACHE_MAX) → newCache` (pure; stamps `value.at = now`; evicts oldest by `at` beyond `max`), `CACHE_MAX = 200`.

- [ ] **Step 1: Write the failing test**

`test/cache.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, cachePut, CACHE_MAX } from '../src/cache.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/cache.test.js`
Expected: FAIL (cannot find `../src/cache.js`)

- [ ] **Step 3: Write minimal implementation**

`src/cache.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/cache.test.js`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add src/cache.js test/cache.test.js
git commit -m "Add bounded translation cache"
```

---

### Task 4: Providers (`src/providers.js`)

**Files:**
- Create: `src/providers.js`
- Test: `test/providers.test.js`

**Interfaces:**
- Produces:
  - `PROVIDERS: { [id]: { name: string, fields: string[], translate(texts: string[], target: string, creds: object, fetchFn) → Promise<{ texts: string[], detected?: string }> } }` with ids `google`, `microsoft`, `deepl`, `yandex`. `fields` are credential names used by the options page: `apiKey`, `region`, `folderId`.
  - `chunk(texts, { maxItems, maxChars }) → string[][]`, `LIMITS = { maxItems: 50, maxChars: 20000 }`.
  - `translateAll(providerId, texts, target, creds, fetchFn = fetch) → Promise<{ texts: string[], detected: string }>` — `detected` is a lower-case ISO 639-1 code (region stripped) or `''`.

- [ ] **Step 1: Write the failing test**

`test/providers.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/providers.test.js`
Expected: FAIL (cannot find `../src/providers.js`)

- [ ] **Step 3: Write minimal implementation**

`src/providers.js`:
```js
// Every Provider auto-detects the Source Language and returns it with the Translation.
// Each `translate` handles ONE request; `translateAll` chunks and concatenates.

export const LIMITS = { maxItems: 50, maxChars: 20000 }; // under every Provider's per-request limit

export function chunk(texts, { maxItems, maxChars } = LIMITS) {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= maxItems || chars + t.length > maxChars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function postJson(fetchFn, url, headers, body) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// DeepL wants regional variants for these; everything else is the upper-cased ISO code.
const DEEPL_TARGET = { en: 'EN-US', pt: 'PT-PT' };

export const PROVIDERS = {
  google: {
    name: 'Google Cloud Translation',
    fields: ['apiKey'],
    async translate(texts, target, creds, fetchFn) {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(creds.apiKey)}`;
      const data = await postJson(fetchFn, url, {}, { q: texts, target, format: 'text' });
      const t = data.data.translations;
      return { texts: t.map((x) => x.translatedText), detected: t[0]?.detectedSourceLanguage };
    },
  },
  microsoft: {
    name: 'Microsoft Translator',
    fields: ['apiKey', 'region'],
    async translate(texts, target, creds, fetchFn) {
      const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(target)}`;
      const headers = { 'Ocp-Apim-Subscription-Key': creds.apiKey, 'Ocp-Apim-Subscription-Region': creds.region };
      const data = await postJson(fetchFn, url, headers, texts.map((Text) => ({ Text })));
      return { texts: data.map((x) => x.translations[0].text), detected: data[0]?.detectedLanguage?.language };
    },
  },
  deepl: {
    name: 'DeepL',
    fields: ['apiKey'],
    async translate(texts, target, creds, fetchFn) {
      const host = creds.apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
      const body = { text: texts, target_lang: DEEPL_TARGET[target] ?? target.toUpperCase() };
      const data = await postJson(fetchFn, `https://${host}/v2/translate`, { Authorization: `DeepL-Auth-Key ${creds.apiKey}` }, body);
      return { texts: data.translations.map((x) => x.text), detected: data.translations[0]?.detected_source_language?.toLowerCase() };
    },
  },
  yandex: {
    name: 'Yandex Translate',
    fields: ['apiKey', 'folderId'],
    async translate(texts, target, creds, fetchFn) {
      const body = { folderId: creds.folderId, texts, targetLanguageCode: target };
      const data = await postJson(fetchFn, 'https://translate.api.cloud.yandex.net/translate/v2/translate', { Authorization: `Api-Key ${creds.apiKey}` }, body);
      return { texts: data.translations.map((x) => x.text), detected: data.translations[0]?.detectedLanguageCode };
    },
  },
};

export async function translateAll(providerId, texts, target, creds, fetchFn = fetch) {
  const provider = PROVIDERS[providerId];
  const out = [];
  let detected;
  for (const part of chunk(texts)) {
    const r = await provider.translate(part, target, creds, fetchFn);
    out.push(...r.texts);
    detected ??= r.detected;
  }
  return { texts: out, detected: (detected || '').toLowerCase().split('-')[0] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/providers.test.js`
Expected: 9 passing

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all tests in `test/` pass (18 total)

- [ ] **Step 6: Commit**

```bash
git add src/providers.js test/providers.test.js
git commit -m "Add Google, Microsoft, DeepL and Yandex providers"
```

---

### Task 5: Runtime wiring — content script and background

**Files:**
- Create: `src/content.js`, `src/background.js`

**Interfaces:**
- Consumes: `globalThis.TM_TEXT` (Task 2), `PROVIDERS`, `translateAll` (Task 4), `cacheKey`, `cachePut` (Task 3), locale keys (Task 1).
- Produces (content-script message protocol over `messenger.tabs.sendMessage`):
  - `{ cmd: 'toggle' }` → `{ shown: false, texts: string[] }` when there is no Translation yet (texts = trimmed text-node strings in document order), `{ shown: true }` after re-applying a held Translation, `{ shown: false }` after restoring the Original.
  - `{ cmd: 'apply', subject: string, texts: string[] }` → `{ shown: true }`; `texts.length` must equal the length returned by the last `toggle`.
- Storage shape (`messenger.storage.local`): `{ provider: 'google'|'microsoft'|'deepl'|'yandex', target: 'en', creds: { [providerId]: { apiKey, region?, folderId? } }, cache: { [cacheKey]: { subject, texts, detected, at } } }`. Task 6 writes `provider`/`target`/`creds` and removes `cache`.

- [ ] **Step 1: Write `src/content.js`**

```js
// Injected into the displayed message (after src/text.js) by background.js on every click.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, SKIP_TAGS } = globalThis.TM_TEXT;

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts }
  let shown = false;
  let subjectEl = null;

  function collect() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && shouldTranslate(n.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    nodes = [];
    originals = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n);
      originals.push(n.nodeValue);
    }
    return originals.map((s) => splitWhitespace(s)[1]);
  }

  function apply({ subject, texts }) {
    nodes.forEach((n, i) => {
      const [lead, , trail] = splitWhitespace(originals[i]);
      n.nodeValue = lead + texts[i] + trail;
    });
    if (subject) {
      subjectEl ??= Object.assign(document.createElement('div'), {
        textContent: api.i18n.getMessage('subjectLine', subject),
        style: 'font-weight:bold;margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid #ccc',
      });
      document.body.prepend(subjectEl);
    }
    shown = true;
  }

  function restore() {
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    subjectEl?.remove();
    shown = false;
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts };
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect() });
      default:
        return undefined;
    }
  });
}
```

- [ ] **Step 2: Write `src/background.js`**

```js
import { PROVIDERS, translateAll } from './providers.js';
import { cacheKey, cachePut } from './cache.js';

const t = (key, subs) => messenger.i18n.getMessage(key, subs);

function languageName(code) {
  try {
    return new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' }).of(code);
  } catch {
    return code;
  }
}

// Detected Source Language per tab, so toggling back and forth keeps the badge.
const detectedByTab = new Map();

async function setButton(tabId, title, badge) {
  await messenger.messageDisplayAction.setTitle({ tabId, title });
  await messenger.messageDisplayAction.setBadgeText({ tabId, text: badge });
}

// A newly displayed message is a fresh document: the content script state is gone, reset the button too.
messenger.messageDisplay.onMessagesDisplayed.addListener((tab) => {
  detectedByTab.delete(tab.id);
  setButton(tab.id, t('translate'), '');
});

messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  try {
    const { provider, target = 'en', creds = {}, cache = {} } =
      await messenger.storage.local.get(['provider', 'target', 'creds', 'cache']);
    const p = PROVIDERS[provider];
    const c = creds[provider] ?? {};
    if (!p || p.fields.some((f) => !c[f])) {
      await messenger.runtime.openOptionsPage();
      return;
    }

    await messenger.scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] });
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle' });
    if (!state.texts) {
      // Toggled an existing Translation on or off.
      await setButton(tabId, t(state.shown ? 'showOriginal' : 'translate'), detectedByTab.get(tabId) ?? '');
      return;
    }

    const [msg] = (await messenger.messageDisplay.getDisplayedMessages(tabId)).messages;
    const subject = (msg.subject ?? '').trim();
    if (!subject && state.texts.length === 0) {
      await setButton(tabId, t('nothingToTranslate'), '');
      return;
    }

    const key = cacheKey(msg.headerMessageId, provider, target);
    let hit = cache[key];
    if (!hit) {
      await setButton(tabId, t('translating'), '…');
      const input = subject ? [subject, ...state.texts] : state.texts;
      const r = await translateAll(provider, input, target, c);
      hit = subject
        ? { subject: r.texts[0], texts: r.texts.slice(1), detected: r.detected }
        : { subject: '', texts: r.texts, detected: r.detected };
      // ponytail: read-modify-write of the whole cache; concurrent clicks in two tabs can drop one entry. Fine for a cache.
      await messenger.storage.local.set({ cache: cachePut(cache, key, hit, Date.now()) });
    }

    const badge = hit.detected.toUpperCase();
    detectedByTab.set(tabId, badge);
    if (hit.detected === target) {
      await setButton(tabId, t('alreadyIn', languageName(target)), '=');
      return;
    }
    await messenger.tabs.sendMessage(tabId, { cmd: 'apply', subject: hit.subject, texts: hit.texts });
    await setButton(tabId, t('showOriginal'), badge);
  } catch (e) {
    await setButton(tabId, `${t('error')}: ${e.message}`, '!');
  }
});
```

- [ ] **Step 3: Syntax-check both files**

Run: `node --check src/content.js && node --check src/background.js && echo ok`
Expected: `ok`

- [x] **Step 4: Manual smoke test in Thunderbird** (executor: do this only if you can run Thunderbird; otherwise record "not run" in your report — the user will do it)

1. Thunderbird → Tools → Add-ons and Themes → gear → Debug Add-ons → Load Temporary Add-on → pick `manifest.json`.
2. Open a message. A **Translate** button appears in the message header toolbar.
3. With no credentials configured, clicking opens the options page (blank until Task 6 — that is expected).
4. Check the Debug Add-ons → Inspect console for errors on load and click.

- [ ] **Step 5: Commit**

```bash
git add src/content.js src/background.js
git commit -m "Wire translate button, content script and cache"
```

---

### Task 6: Options page

**Files:**
- Create: `src/languages.js`, `src/options.html`, `src/options.js`

**Interfaces:**
- Consumes: `PROVIDERS[id].name` / `.fields` (Task 4), storage shape from Task 5, locale keys `optProvider`, `optTarget`, `clearCache`, `cacheCleared`, `field_apiKey`, `field_region`, `field_folderId`, `optionsHint` (Task 1).
- Produces: `LANGUAGES: string[]` (ISO 639-1 codes) from `src/languages.js`.

- [ ] **Step 1: Write `src/languages.js`**

```js
// Target Language choices. Not every Provider supports every code (e.g. DeepL has no
// Croatian/Serbian target); the Provider then returns an error shown in the button title.
export const LANGUAGES = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'he', 'hr', 'hu', 'id',
  'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv',
  'th', 'tr', 'uk', 'vi', 'zh',
];
```

- [ ] **Step 2: Write `src/options.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font: message-box; padding: 8px 12px; min-width: 320px; }
    label { display: block; margin: 0 0 12px; }
    label > span { display: block; margin-bottom: 4px; }
    input, select { width: 100%; box-sizing: border-box; }
    p { color: GrayText; font-size: 0.9em; }
  </style>
</head>
<body>
  <label><span data-i18n="optProvider"></span><select id="provider"></select></label>
  <div id="fields"></div>
  <label><span data-i18n="optTarget"></span><select id="target"></select></label>
  <button id="clearCache" data-i18n="clearCache"></button> <span id="status"></span>
  <p data-i18n="optionsHint"></p>
  <script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `src/options.js`**

```js
import { PROVIDERS } from './providers.js';
import { LANGUAGES } from './languages.js';

const $ = (id) => document.getElementById(id);
const t = (key) => messenger.i18n.getMessage(key);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

const names = new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' });
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').add(new Option(p.name, id));
for (const code of LANGUAGES) $('target').add(new Option(names.of(code), code));

let creds = {};

function save() {
  return messenger.storage.local.set({ provider: $('provider').value, target: $('target').value, creds });
}

// One input per credential field of the selected Provider; other Providers' credentials are kept.
function renderFields() {
  const id = $('provider').value;
  $('fields').replaceChildren(...PROVIDERS[id].fields.map((field) => {
    const label = document.createElement('label');
    label.append(Object.assign(document.createElement('span'), { textContent: t(`field_${field}`) }));
    const input = Object.assign(document.createElement('input'), {
      type: field === 'apiKey' ? 'password' : 'text',
      value: creds[id]?.[field] ?? '',
    });
    input.addEventListener('input', () => {
      (creds[id] ??= {})[field] = input.value.trim();
      save();
    });
    label.append(input);
    return label;
  }));
}

$('provider').addEventListener('change', () => { renderFields(); save(); });
$('target').addEventListener('change', save);
$('clearCache').addEventListener('click', async () => {
  await messenger.storage.local.remove('cache');
  $('status').textContent = t('cacheCleared');
});

const s = await messenger.storage.local.get({ provider: 'deepl', target: 'en', creds: {} });
creds = s.creds;
$('provider').value = s.provider;
$('target').value = s.target;
renderFields();
```

- [ ] **Step 4: Syntax-check**

Run: `node --check src/options.js && node --check src/languages.js && npm test && echo ok`
Expected: tests pass, `ok`

- [ ] **Step 5: Manual check in Thunderbird** (executor: only if you can run Thunderbird; otherwise report "not run")

1. Reload the temporary add-on, open its Preferences: Provider dropdown lists the four Providers; switching Provider swaps the credential inputs; Target Language list shows localized names.
2. Enter a DeepL free key, pick a Target Language, open a foreign-language message, click Translate → body and a `Subject:` line are translated, badge shows the Source Language code, title reads "Show original"; click again → Original restored. Click a third time → instant (no network). Switch to another message → button resets to "Translate".

- [ ] **Step 6: Commit**

```bash
git add src/languages.js src/options.html src/options.js
git commit -m "Add options page"
```

---

### Task 7: README and packaging

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Translate Mail

Thunderbird add-on (128+) that adds a **Translate** button to the message header toolbar. One click translates the subject and body of the message you are reading into your language, in place; click again to show the original. Bring your own API key for one of:

| Provider | Where to get credentials | Free tier |
|---|---|---|
| DeepL | https://www.deepl.com/pro-api → API key (free keys end in `:fx`) | 500 000 chars/month |
| Microsoft Translator | Azure portal → Translator resource → Keys and Endpoint (key + region) | 2 000 000 chars/month (F0) |
| Google Cloud Translation | Google Cloud console → enable Cloud Translation API → API key | billed (500 000 chars/month free with billing enabled) |
| Yandex Translate | Yandex Cloud console → service account API key + folder ID | trial grant only |

Message text is sent to the selected Provider **only when you click Translate**. Translations are cached locally (200 most recent) so reopening a message is free.

Not every Provider supports every target language (e.g. DeepL has no Croatian target); unsupported combinations show the Provider's error in the button tooltip.

## Install for development

Thunderbird → Tools → Add-ons and Themes → gear icon → **Debug Add-ons** → **Load Temporary Add-on** → choose `manifest.json`. Then open the add-on's Preferences, pick a Provider, paste the key, choose the target language.

## Tests

```
npm test
```

## Package

From PowerShell in the repo root:

```
Compress-Archive -Force -Path manifest.json,_locales,icons,src -DestinationPath translate-mail.zip
```

Rename to `.xpi` or upload the `.zip` to addons.thunderbird.net.
````

- [ ] **Step 2: Verify the package contains only runtime files**

Run (PowerShell): `Compress-Archive -Force -Path manifest.json,_locales,icons,src -DestinationPath translate-mail.zip; (Get-Item translate-mail.zip).Length -gt 0`
Expected: `True`. (`*.zip` is git-ignored.)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add README"
```
