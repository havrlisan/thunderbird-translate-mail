# Compose-side "Translate reply" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `compose_action` button whose popup translates the draft you are writing (not the quoted text or signature) into a picked language — preselected to the Source Language of the message you are answering — in place, with "Show original" to flip back.

**Architecture:** The popup (`src/compose.html` + `src/compose.js`) is a thin view: it asks the background for state, sends one `composeTranslate` message, renders the reply. The background reuses the reading side wholesale: `loadSettings()`, `translateAll`, and the same `src/text.js` + `src/content.js` injected into the compose editor via `scripting.executeScript`. `content.js` gets three tiny changes (no header block when there is nothing to show, a `reuse: false` flag, a `state` command). The suggested language comes from the existing translation cache via a new pure helper `cachedDetected`.

**Tech Stack:** Thunderbird MailExtension API (MV3, `messenger.*`), plain ES2022 JavaScript, Node `node --test`, no dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-compose-translate-design.md` (glossary in `CONTEXT.md`; v1 design in `docs/superpowers/specs/2026-08-25-translate-mail-design.md`).

## Global Constraints

- `manifest_version: 3`, `strict_min_version = "128.0"`. Version becomes `0.3.0` in `manifest.json` and `package.json` (Task 6).
- Plain JS, **no dependencies, no bundler, no TypeScript**.
- All user-visible strings go through `_locales/en/messages.json` (`messenger.i18n.getMessage`). No hard-coded UI text in JS/HTML.
- Use the `messenger` global in extension code; the content script alone uses `globalThis.messenger ?? globalThis.browser`.
- Vocabulary from `CONTEXT.md`: Provider, Target Language, Source Language, Translation, Original.
- Markup is never sent to a Provider — only trimmed text-node strings.
- Quoted text and signatures are **always** skipped on the compose side (`skipQuoted: true`); the subject is never touched; no cache on the compose side.
- Commit after every task; **never push**. Commit messages: short subject, trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01JzRQiGNjJLYJfgwqGBkwin`.
- Run tests with `npm test` from the repo root.
- Thunderbird 154 is installed at `C:\Program Files\Mozilla Thunderbird`; manual checks use Add-ons and Themes → gear → Debug Add-ons → Load Temporary Add-on → `manifest.json`. Only Luka can run those; a task that needs one ends with a **STOP — human check** step.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `manifest.json` | modify | `compose` permission, `compose_action` with popup |
| `_locales/en/messages.json` | modify | `translateReply`, `composeInto`, `setupFirst`; description update |
| `src/cache.js`, `test/cache.test.js` | modify | `cachedDetected(cache, headerMessageId)` |
| `src/content.js` | modify | header block only when needed; `reuse` flag; `state` command |
| `src/background.js` | modify | `loadSettings()`, `inject()`, `composeState`, `composeTranslate`, `runtime.onMessage` router |
| `src/compose.html`, `src/compose.js` | create | popup view |
| `README.md`, `ROADMAP.md`, `docs/smoke-test-0.3.0.md` | modify/create | docs, roadmap item 10 removed, smoke checklist |

---

### Task 1: Feasibility check — `scripting.executeScript` into a compose tab

**Files:**
- Modify: `manifest.json` (permissions, `compose_action` without popup for now)
- Modify: `_locales/en/messages.json` (add `translateReply`)
- Modify: `src/background.js` (temporary spike listener at the end of the file)

**Interfaces:**
- Produces: manifest permission `compose` and the `compose_action` key that Task 5 completes with `default_popup`. Locale key `translateReply`.

- [ ] **Step 1: Manifest — add the permission and the button**

In `manifest.json`, change the `permissions` line and add `compose_action` right after `message_display_action`:

```json
  "compose_action": {
    "default_title": "__MSG_translateReply__",
    "default_icon": "icons/translate.svg"
  },
```

```json
  "permissions": ["messagesRead", "scripting", "storage", "compose"],
```

- [ ] **Step 2: Locale — add the button title**

In `_locales/en/messages.json`, after the `"translate"` entry add:

```json
  "translateReply": { "message": "Translate reply" },
```

- [ ] **Step 3: Spike listener**

Append to `src/background.js`:

```js
// SPIKE (removed in Task 5): does executeScript reach the compose editor, and do the reading-side selectors apply there?
messenger.composeAction.onClicked.addListener(async (tab) => {
  const [r] = await messenger.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      chars: document.body.innerText.length,
      quoted: document.querySelectorAll('blockquote[type=cite], .moz-cite-prefix').length,
      signature: document.querySelectorAll('.moz-signature').length,
    }),
  });
  console.log('compose spike', JSON.stringify(r.result));
});
```

- [ ] **Step 4: Commit**

```bash
git add manifest.json _locales/en/messages.json src/background.js
git commit -m "Spike: compose_action + executeScript into the compose editor"
```

- [ ] **Step 5: STOP — human check (Luka)**

Load the add-on temporarily in TB 154, open Debug Add-ons → **Inspect** on the add-on to see its console, then:
1. Reply (HTML) to a message from an account with a signature → click the new toolbar button in the compose window → console shows `compose spike {"chars":N,"quoted":1,"signature":1}` with N > 0.
2. Reply as plain text (hold Shift on Reply, or an account set to plain text) → same click → `quoted` ≥ 1 and `signature` ≥ 1 again (confirms the plain-text editor uses the same markup).
3. New blank message → `chars` small, `quoted: 0`.

Outcome A — all three log as expected: continue with Task 2.
Outcome B — the call throws (e.g. "No matching tab" / permission error) or `quoted`/`signature` are 0 in the plain-text case: **stop the plan** and report; the spec's fallback (`getComposeDetails().body` + `DOMParser` + `setComposeDetails`) needs its own plan.

Record the outcome as one line under "## Verification" in `docs/superpowers/specs/2026-08-26-compose-translate-design.md` and commit it:

```bash
git add docs/superpowers/specs/2026-08-26-compose-translate-design.md
git commit -m "Spec: record compose executeScript check"
```

---

### Task 2: `cachedDetected` helper

**Files:**
- Modify: `src/cache.js`
- Test: `test/cache.test.js`

**Interfaces:**
- Produces: `export function cachedDetected(cache, headerMessageId): string | undefined` — the `detected` Source Language of any cache entry whose key starts with `<headerMessageId>|`. Task 4 consumes it.

- [ ] **Step 1: Write the failing tests**

Append to `test/cache.test.js` (and extend the import line to `import { cacheKey, cachePut, cachedDetected, CACHE_MAX } from '../src/cache.js';`):

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the two new tests FAIL with `cachedDetected is not a function` (or an import error); all others pass.

- [ ] **Step 3: Implement**

Append to `src/cache.js`:

```js
// Source Language the reading side detected for this message, from any cached Translation of it (any Provider/target).
export function cachedDetected(cache, headerMessageId) {
  if (!headerMessageId) return undefined;
  const prefix = `${headerMessageId}|`;
  for (const [k, v] of Object.entries(cache)) if (k.startsWith(prefix) && v.detected) return v.detected;
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cache.js test/cache.test.js
git commit -m "cache: cachedDetected(headerMessageId)"
```

---

### Task 3: `content.js` — no empty header, `reuse` flag, `state` command

**Files:**
- Modify: `src/content.js`

**Interfaces:**
- Produces: message protocol additions consumed by Task 4:
  - `{ cmd: 'toggle', skipQuoted, settingsKey, reuse?: boolean }` — with `reuse === false`, a previous Translation is never re-applied; the script re-collects and returns `texts`.
  - `{ cmd: 'apply', subject: '', texts, note: '', settingsKey }` — inserts no header block when `subject` and `note` are both empty.
  - `{ cmd: 'state' }` → `{ shown: boolean }`.

No unit test: this file needs a DOM; behaviour is covered by the smoke test in Task 6.

- [ ] **Step 1: Header block only when there is something to show**

In `apply`, replace

```js
    if (!headerEl) {
      headerEl = line('', 'margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid currentColor');
      if (subject) headerEl.append(line(api.i18n.getMessage('subjectLine', subject), 'font-weight:bold'));
      if (note) headerEl.append(line(note, 'opacity:.7;font-size:.9em'));
    }
    document.body.prepend(headerEl);
```

with

```js
    if (!headerEl && (subject || note)) {
      headerEl = line('', 'margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid currentColor');
      if (subject) headerEl.append(line(api.i18n.getMessage('subjectLine', subject), 'font-weight:bold'));
      if (note) headerEl.append(line(note, 'opacity:.7;font-size:.9em'));
    }
    if (headerEl) document.body.prepend(headerEl);
```

- [ ] **Step 2: `reuse` flag and `state` command**

In the `onMessage` listener, replace

```js
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
```

with

```js
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        // A compose draft may have changed since; the compose side passes reuse:false and always re-collects.
        if (msg.reuse !== false && translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
      case 'state':
        return Promise.resolve({ shown });
```

Also update the header comment's first line to: `// Injected into the displayed message or the compose editor (after src/text.js) by background.js.`

- [ ] **Step 3: Run tests (unchanged, sanity)**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/content.js
git commit -m "content: skip empty header block, reuse flag, state command"
```

---

### Task 4: Background — `loadSettings`, `inject`, compose handlers

**Files:**
- Modify: `src/background.js`
- Modify: `_locales/en/messages.json` (add `setupFirst`)

**Interfaces:**
- Consumes: `cachedDetected` (Task 2); content protocol (Task 3).
- Produces: `runtime.onMessage` protocol consumed by the popup (Task 5):
  - `{ cmd: 'composeState', tabId }` → `{ shown: boolean, suggested: string, busy: boolean }`
  - `{ cmd: 'composeTranslate', tabId, lang }` → one of
    `{ shown: true, from, to }` · `{ shown: false }` · `{ alreadyIn: lang }` · `{ busy: true }` ·
    `{ error: 'setupFirst' | 'nothingToTranslate' | <errorKey>, details?, provider?, status? }`

- [ ] **Step 1: Locale — `setupFirst`**

In `_locales/en/messages.json`, after `"nothingToTranslate"` add:

```json
  "setupFirst": { "message": "Set up a Provider in the add-on settings first" },
```

- [ ] **Step 2: Import `cachedDetected`**

Change the second import line of `src/background.js` to:

```js
import { cacheKey, cachePut, cachedDetected } from './cache.js';
```

- [ ] **Step 3: Extract `loadSettings` and `inject`**

Insert after the `showOriginalButton` function:

```js
// Everything both click paths need. `creds` is narrowed to the selected Provider; `configured` is false when
// no Provider is chosen or a credential field is empty.
async function loadSettings() {
  const { provider, target = 'en', creds = {}, cache = {}, translateQuoted = false, replyLang } =
    await messenger.storage.local.get(['provider', 'target', 'creds', 'cache', 'translateQuoted', 'replyLang']);
  const c = creds[provider] ?? {};
  const p = PROVIDERS[provider];
  return { provider, target, creds: c, cache, translateQuoted, replyLang, configured: !!p && p.fields.every((f) => c[f]) };
}

// Idempotent: content.js guards against running twice in the same document.
const inject = (tabId) => messenger.scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] });
```

Then in the `messageDisplayAction.onClicked` handler replace

```js
  let provider;
  try {
    let target, creds, cache, translateQuoted;
    ({ provider, target = 'en', creds = {}, cache = {}, translateQuoted = false } =
      await messenger.storage.local.get(['provider', 'target', 'creds', 'cache', 'translateQuoted']));
    const p = PROVIDERS[provider];
    const c = creds[provider] ?? {};
    if (!p || p.fields.some((f) => !c[f])) {
      await messenger.runtime.openOptionsPage();
      return;
    }

    // The content script reuses its last Translation only if it was made with the same settings.
    const settingsKey = `${provider}|${target}|${translateQuoted}`;
    await messenger.scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] });
```

with

```js
  let provider;
  try {
    let target, c, cache, translateQuoted, configured;
    ({ provider, target, creds: c, cache, translateQuoted, configured } = await loadSettings());
    if (!configured) {
      await messenger.runtime.openOptionsPage();
      return;
    }

    // The content script reuses its last Translation only if it was made with the same settings.
    const settingsKey = `${provider}|${target}|${translateQuoted}`;
    await inject(tabId);
```

The rest of that handler already uses `c`, `cache`, `target`, `translateQuoted` — unchanged.

- [ ] **Step 4: Compose handlers and router**

Insert before the `// SPIKE` block (end of file):

```js
// --- Compose side: the popup (src/compose.js) drives these over runtime.sendMessage. ---

// Language to suggest for a reply: what the reading side detected on the message being answered,
// else the last language used here, else the Target Language.
async function suggestedLanguage(tabId, { cache, replyLang, target }) {
  try {
    const { relatedMessageId } = await messenger.compose.getComposeDetails(tabId);
    if (relatedMessageId) {
      const { headerMessageId } = await messenger.messages.get(relatedMessageId);
      const detected = cachedDetected(cache, headerMessageId);
      if (detected) return detected;
    }
  } catch (e) {
    console.error(e); // no related message (new mail, reopened draft) or it is gone; fall through
  }
  return replyLang ?? target;
}

async function composeState(tabId) {
  await inject(tabId);
  const { shown } = await messenger.tabs.sendMessage(tabId, { cmd: 'state' });
  return { shown, suggested: await suggestedLanguage(tabId, await loadSettings()), busy: inFlight.has(tabId) };
}

// Translate the draft (quoted text and signature excluded) into `lang`, or restore the Original if a Translation
// is shown. No cache: drafts change. Errors are returned, not thrown — the popup renders them.
async function composeTranslate(tabId, lang) {
  if (inFlight.has(tabId)) return { busy: true };
  inFlight.add(tabId);
  let provider;
  try {
    const s = await loadSettings();
    provider = s.provider;
    if (!s.configured) {
      await messenger.runtime.openOptionsPage();
      return { error: 'setupFirst' };
    }
    await inject(tabId);
    const settingsKey = `${provider}|${lang}`;
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: true, reuse: false, settingsKey });
    if (!state.texts) return { shown: false }; // restored the Original
    if (state.texts.length === 0) return { error: 'nothingToTranslate' };
    const r = await translateAll(provider, state.texts, lang, s.creds);
    if (r.detected === lang) return { alreadyIn: lang };
    await messenger.tabs.sendMessage(tabId, { cmd: 'apply', subject: '', texts: r.texts, note: '', settingsKey });
    await messenger.storage.local.set({ replyLang: lang });
    return { shown: true, from: r.detected, to: lang };
  } catch (e) {
    console.error(e);
    return { error: errorKey(e, provider), details: e.message, provider, status: e.status };
  } finally {
    inFlight.delete(tabId);
  }
}

messenger.runtime.onMessage.addListener((msg) => {
  if (msg.cmd === 'composeState') return composeState(msg.tabId);
  if (msg.cmd === 'composeTranslate') return composeTranslate(msg.tabId, msg.lang);
  return undefined;
});
```

- [ ] **Step 5: Syntax check and tests**

Run: `node --check src/background.js && npm test`
Expected: no syntax error; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/background.js _locales/en/messages.json
git commit -m "background: loadSettings/inject; composeState and composeTranslate handlers"
```

---

### Task 5: Popup

**Files:**
- Create: `src/compose.html`, `src/compose.js`
- Modify: `manifest.json` (`default_popup`), `_locales/en/messages.json` (`composeInto`), `src/background.js` (remove the spike)

**Interfaces:**
- Consumes: the `runtime.onMessage` protocol from Task 4; `LANGUAGES` from `src/languages.js`; `PROVIDERS` from `src/providers.js`; locale keys `translate`, `showOriginal`, `translating`, `alreadyIn`, `translatedNote`, `nothingToTranslate`, `setupFirst`, `error*`.

- [ ] **Step 1: Locale — `composeInto`**

In `_locales/en/messages.json`, after `"optQuoted"` add:

```json
  "composeInto": { "message": "Translate into" },
```

- [ ] **Step 2: Manifest — attach the popup**

In `manifest.json`, `compose_action` becomes:

```json
  "compose_action": {
    "default_title": "__MSG_translateReply__",
    "default_icon": "icons/translate.svg",
    "default_popup": "src/compose.html"
  },
```

- [ ] **Step 3: Remove the spike**

Delete the whole `// SPIKE …` block (the `composeAction.onClicked` listener) from the end of `src/background.js`. `onClicked` never fires once a popup is set anyway.

- [ ] **Step 4: `src/compose.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="style.css">
  <style>
    body { width: 280px; }
    .row { display: flex; align-items: center; gap: 10px; }
  </style>
</head>
<body>
  <label><span data-i18n="composeInto"></span><select id="lang"></select></label>
  <div class="row"><button id="go"></button><span id="status" class="muted"></span></div>
  <script src="theme.js"></script>
  <script type="module" src="compose.js"></script>
</body>
</html>
```

- [ ] **Step 5: `src/compose.js`**

```js
// compose_action popup: one language select, one button. The background does all the work, so closing the
// popup mid-translation cancels nothing; reopening it shows the true state.
import { PROVIDERS } from './providers.js';
import { LANGUAGES } from './languages.js';

const $ = (id) => document.getElementById(id);
const t = (key, subs) => messenger.i18n.getMessage(key, subs);
const names = new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' });
const name = (code) => { try { return names.of(code); } catch { return code; } };
const send = (msg) => messenger.runtime.sendMessage(msg).catch((e) => ({ error: 'errorGeneric', details: e.message }));

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const code of LANGUAGES) $('lang').add(new Option(name(code), code));

function render(r) {
  $('go').disabled = !!r.busy;
  $('go').textContent = t(r.shown ? 'showOriginal' : 'translate');
  $('status').title = r.details ?? '';
  $('status').textContent =
    r.busy ? t('translating')
    : r.error ? t(r.error, [PROVIDERS[r.provider]?.name ?? '', String(r.status ?? '')])
    : r.alreadyIn ? t('alreadyIn', name(r.alreadyIn))
    : r.shown ? t('translatedNote', [name(r.from), name(r.to)])
    : '';
}

const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });

$('go').addEventListener('click', async () => {
  $('go').disabled = true;
  $('status').textContent = t('translating');
  render(await send({ cmd: 'composeTranslate', tabId: tab.id, lang: $('lang').value }));
});

const state = await send({ cmd: 'composeState', tabId: tab.id });
if (state.suggested) {
  if (!LANGUAGES.includes(state.suggested)) $('lang').add(new Option(name(state.suggested), state.suggested));
  $('lang').value = state.suggested;
}
render(state);
```

- [ ] **Step 6: Syntax check and tests**

Run: `node --check src/compose.js && node --check src/background.js && npm test`
Expected: no syntax errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add manifest.json _locales/en/messages.json src/compose.html src/compose.js src/background.js
git commit -m "Compose popup: translate reply into a picked language, show original"
```

- [ ] **Step 8: STOP — human check (Luka)**

Reload the temporary add-on (Debug Add-ons → Reload). Then in a compose window:
1. Reply to a message you translated earlier on the reading side → click the button → popup opens, language preselected to that message's Source Language → **Translate** → your text is translated in place; quoted block, `On … wrote:` line and signature untouched; no extra line inserted above your text; status `Translated: X → Y`, button `Show original`.
2. **Show original** → your text back exactly; status empty.
3. Edit your text, Translate again → the new text is translated (not the stale one).
4. New message (no related message) → language preselected to the one used in step 1.
5. Pick your own language and Translate a draft written in it → `Already in <language>`, draft untouched.
6. Empty draft → `Nothing to translate`.
7. Break the API key in Options → Translate → the Provider error text in the popup, raw response in its tooltip. Fix the key.
8. Plain-text compose → steps 1–2 again.
9. Translate a long draft, close the popup immediately, reopen → `Translating…` with the button disabled; reopen after a moment → `Show original`.

Report anything off; fix before Task 6.

---

### Task 5b: Round-trip keeps edits (amendment after the Task 5 smoke test)

Luka's smoke test: translate, edit the translated text, "Show original" → the edits were gone. Spec amended (sections "`content.js` changes" and "Limitations"): `restore` snapshots the current text into the remembered Translation; `toggle` re-applies it only while the Original is unchanged; the `reuse` flag is removed.

**Files:**
- Modify: `src/content.js`
- Modify: `src/background.js` (drop `reuse: false`)

**Interfaces:**
- Consumes: `{ cmd: 'toggle', skipQuoted, settingsKey }` from both sides; `reuse` is no longer read.
- Produces: unchanged reply shapes. Behavior: after `restore`, a `toggle` with the same `settingsKey` re-applies the Translation (with any edits made to it) if the walk finds the same text nodes with the Original texts; otherwise returns fresh `texts`.

No unit test (DOM); covered by the smoke items in Task 6.

- [ ] **Step 1: Split the walk out of `collect`**

In `src/content.js`, replace the whole `collect` function (from `function collect(skipQuoted) {` to its closing `}`) with:

```js
  // Text nodes worth translating, in document order.
  function walk(skipQuoted) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && shouldTranslate(n.nodeValue) &&
        !(skipQuoted && n.parentElement?.closest(SKIP_SELECTOR))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  function collect(found) {
    nodes = found;
    originals = nodes.map((n) => n.nodeValue);
    return originals.map((s) => unwrap(splitWhitespace(s)[1]));
  }

  // The Original is as it was when last shown: same text nodes with the same text. Edits, new paragraphs and
  // editor rewrites all count as changes and get a fresh translation.
  const unchanged = (found) => found.length === nodes.length && found.every((n, i) => n.nodeValue === originals[i]);
```

- [ ] **Step 2: `restore` keeps edits made to the Translation**

Replace

```js
  function restore() {
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
```

with

```js
  function restore() {
    // Snapshot the text as it is now, so edits made to the Translation come back with it.
    translation.texts = nodes.map((n) => splitWhitespace(n.nodeValue)[1]);
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
```

- [ ] **Step 3: `toggle` without the `reuse` flag**

Replace

```js
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        // A compose draft may have changed since; the compose side passes reuse:false and always re-collects.
        if (msg.reuse !== false && translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
```

with

```js
      case 'toggle': {
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        const found = walk(msg.skipQuoted);
        if (translation && settingsKey === msg.settingsKey && unchanged(found)) {
          nodes = found;
          apply(translation);
          return Promise.resolve({ shown: true });
        }
        return Promise.resolve({ shown: false, texts: collect(found) });
      }
```

- [ ] **Step 4: Background drops the flag**

In `src/background.js` `composeTranslate`, change

```js
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: true, reuse: false, settingsKey });
```

to

```js
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: true, settingsKey });
```

- [ ] **Step 5: Checks**

Run: `node --check src/content.js && node --check src/background.js && npm test`
Expected: no syntax errors; 26/26 PASS. `grep -n reuse src/content.js src/background.js` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/content.js src/background.js
git commit -m "content: Show original keeps edits to the Translation; re-apply only while the Original is unchanged"
```

- [ ] **Step 7: STOP — human check (Luka)**

Reload the temporary add-on. In a compose window:
1. Translate → edit a translated sentence → Show original → your original text is back → Translate → the translation comes back **with your edit**, instantly.
2. Show original → edit the original → Translate → a fresh translation of the edited text ("Translating…", Provider call).
3. Show original → add a new paragraph → Translate → the new paragraph is translated too.
4. Reading side: Translate / Show original / Translate on a message → second Translate is instant as in 0.2.0.

---

### Task 6: Docs, roadmap, version, package

**Files:**
- Modify: `README.md`, `ROADMAP.md`, `manifest.json`, `package.json`, `_locales/en/messages.json`
- Create: `docs/smoke-test-0.3.0.md`

- [ ] **Step 1: README**

After the paragraph starting "The button is also bound to **Ctrl+Shift+X**", insert:

```markdown
In a compose window, the **Translate reply** button translates what you wrote into the language of the message you are answering (preselected when you translated that message; pick any language otherwise). Quoted text and your signature are left alone, the subject is not touched, and **Show original** brings your text back — and **Translate** brings the translation back with any edits you made to it, without another Provider call, as long as the original text was not changed in between. Ctrl+Z does not undo a translation.
```

Change the first sentence of the README from "…adds a **Translate** button to the message header toolbar." to "…adds a **Translate** button to the message header toolbar and a **Translate reply** button to the compose toolbar."

- [ ] **Step 2: Locale — description**

Change `extDescription` to:

```json
  "extDescription": { "message": "Translate the message you are reading into your language, and your reply into theirs, using Google, Microsoft, DeepL or Yandex." },
```

- [ ] **Step 3: ROADMAP**

Delete the item `10. **Compose side: translate my reply.** …` (the whole numbered paragraph). Replace the "Suggested next release" section body with:

```markdown
10 shipped in 0.3.0. Next: `_execute_compose_action` shortcut once a key is verified to fire in a compose window (Ctrl+Shift+X is taken by the reading side); then 6 or 11.
```

- [ ] **Step 4: Version bump**

Set `"version": "0.3.0"` in both `manifest.json` and `package.json`.

- [ ] **Step 5: Smoke-test checklist**

Create `docs/smoke-test-0.3.0.md`:

```markdown
# Smoke test — 0.3.0

Install `translate-mail-0.3.0.xpi` via Add-ons and Themes → gear → Install Add-on From File (not Load Temporary Add-on: it does not exercise the packaged build). Updating from 0.2.0 must show a permission prompt for "Read and modify your email messages as they are being composed".

## A. Reading side (regression)

1. Translate / Show original on an HTML message and a plain-text message → as in 0.2.0, including the `Subject:` + `Translated: X → Y` block at the top.

## B. Compose side

2. **Reply, known language** → translate a foreign message on the reading side, Reply → **Translate reply** button → popup preselects that Source Language → Translate → your text translated in place; quoted block, `On … wrote:` and signature untouched; nothing inserted above your text; status `Translated: X → Y`, button `Show original`.
3. **Show original** → your text back exactly; status empty.
4. **Edit then re-translate** → change your text, Translate → new text translated.
4b. **Edits survive the round trip** → Translate, edit a translated sentence, Show original, Translate → the edited translation is back instantly (no Provider call).
5. **New message** → language preselected to the last one used.
6. **Already in** → draft in the picked language → `Already in <language>`, untouched.
7. **Empty draft** → `Nothing to translate`.
8. **Bad key** → break the key in Options → Provider error text in the popup, raw response in its tooltip. Fix the key.
9. **No Provider configured** → clear the key → Translate → Options page opens, popup says `Set up a Provider in the add-on settings first`. Restore the key.
10. **Plain-text compose** → steps 2–3.
11. **Popup closed mid-flight** → long draft, Translate, close popup at once, reopen → `Translating…`, button disabled; reopen later → `Show original`.
12. **Send** → send a translated reply to yourself → received body is the translation, quoted part original.
```

- [ ] **Step 6: Tests and package**

Run: `npm test && python scripts/package.py`
Expected: all PASS; `translate-mail-0.3.0.xpi` listed with `backslash entries: 0` and containing `src/compose.html`, `src/compose.js`.

- [ ] **Step 7: Commit**

```bash
git add README.md ROADMAP.md manifest.json package.json _locales/en/messages.json docs/smoke-test-0.3.0.md
git commit -m "Bump to 0.3.0; README, roadmap, smoke-test checklist for compose side"
```

The `.xpi` is gitignored (`*.xpi`); do not commit it.

- [ ] **Step 8: STOP — human check (Luka)**

Run `docs/smoke-test-0.3.0.md` against the packaged build, then upload to ATN if green.
