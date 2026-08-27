# Compose-side "Translate reply" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `compose_action` button whose popup translates the draft you are writing (not the quoted text or signature) into a picked language — preselected to the Source Language of the message you are answering — in place, written through the editor so Ctrl+Z undoes it; with a selection, only the selection.

**Architecture:** The popup (`src/compose.html` + `src/compose.js`) is a thin view: it asks the background for state, sends one `composeTranslate` message, renders the reply. The background reuses the reading side wholesale: `loadSettings()`, `translateAll`, and the same `src/text.js` + `src/content.js` injected into the compose editor via `scripting.executeScript`. `content.js` keeps its reading-side logic and adds two compose commands: `composeCollect` (selection or runs of reply text) and `composeInsert` (`execCommand('insertHTML')` per run, so the editor's undo covers it). Tasks 3/5b's toggle changes were superseded by Task 5c. The suggested language comes from the existing translation cache via a new pure helper `cachedDetected`.

**Tech Stack:** Thunderbird MailExtension API (MV3, `messenger.*`), plain ES2022 JavaScript, Node `node --test`, no dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-compose-translate-design.md` (glossary in `CONTEXT.md`; v1 design in `docs/superpowers/specs/2026-08-25-translate-mail-design.md`).

## Global Constraints

- `manifest_version: 3`, `strict_min_version = "128.0"`. Version becomes `0.3.0` in `manifest.json` and `package.json` (Task 6).
- Plain JS, **no dependencies, no bundler, no TypeScript**.
- All user-visible strings go through `_locales/en/messages.json` (`messenger.i18n.getMessage`). No hard-coded UI text in JS/HTML.
- Use the `messenger` global in extension code; the content script alone uses `globalThis.messenger ?? globalThis.browser`.
- Vocabulary from `CONTEXT.md`: Provider, Target Language, Source Language, Translation, Original.
- Reading side: markup is never sent to a Provider — only trimmed text-node strings. Compose side (since Task 5e): each run of the reply goes as its own HTML in the Provider's HTML mode, with quoted blocks and signatures lifted out; the returned HTML is sanitized before insertion.
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
| `_locales/en/messages.json` | modify | `translateReply`, `translateSelection`, `composeInto`, `setupFirst`; description update |
| `src/cache.js`, `test/cache.test.js` | modify | `cachedDetected(cache, headerMessageId)` |
| `src/content.js` | modify | compose commands `composeCollect` / `composeInsert` (undo-safe writes) |
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

### Task 5c: Undo-based compose writes, selection support (redesign after the Task 5b smoke test)

Luka preferred the editor's own undo over a toggle; a spike confirmed `execCommand('insertHTML')` is reverted by one Ctrl+Z in both compose editors. The spec was rewritten accordingly (sections "Product", "Popup", "Translating the draft", "`content.js`"). This task replaces the compose-side parts of Tasks 3, 4, 5 and 5b; the reading side goes back to its 0.2.0 logic.

**Files:**
- Modify: `src/text.js` (`SKIP_SELECTOR`), `test/text.test.js`
- Rewrite: `src/content.js` (full file below)
- Modify: `src/background.js` (`composeState`, `composeTranslate`)
- Modify: `src/compose.js` (`render`, button label), `_locales/en/messages.json` (`translateSelection`)

**Interfaces:**
- Content protocol: `{ cmd: 'composeCollect' }` → `{ selection: boolean, texts: string[] }`; `{ cmd: 'composeInsert', texts }` → `{ inserted: boolean }`. Reading side unchanged: `toggle` → `{ shown }` | `{ shown: false, texts }`, `apply` → `{ shown: true }`.
- Background protocol: `composeState` → `{ suggested, busy, selection }`; `composeTranslate` → `{ from, to }` | `{ alreadyIn }` | `{ busy: true }` | `{ error, details?, provider?, status? }`.

- [ ] **Step 1: Failing test for the selector**

Append to `test/text.test.js` (the destructuring line at the top must also pull `SKIP_SELECTOR`: `const { splitWhitespace, shouldTranslate, SKIP_TAGS, SKIP_SELECTOR } = globalThis.TM_TEXT;` — extend it if `SKIP_SELECTOR` is not already there):

```js
test('SKIP_SELECTOR covers the plain-text compose quotation span', () => {
  assert.ok(SKIP_SELECTOR.includes('span[_moz_quote]'));
});
```

Run: `npm test` → this test FAILS; everything else passes.

- [ ] **Step 2: `text.js` selector**

In `src/text.js`, change the `SKIP_SELECTOR` line to:

```js
  // Quoted replies, "On … wrote:" lines, signatures and inline-forward headers (Thunderbird HTML + plain-text
  // rendering, Gmail, Apple Mail, plain-text compose). Skipped unless the user opts to translate quoted text too.
  SKIP_SELECTOR: 'blockquote[type=cite], span[_moz_quote], .gmail_quote, .moz-cite-prefix, .moz-signature, .moz-txt-sig, .moz-email-headers-table',
```

(Replace the two existing comment lines above `SKIP_SELECTOR` with the two above.) Run `npm test` → all pass (27/27).

- [ ] **Step 3: Rewrite `src/content.js`**

Replace the whole file with:

```js
// Injected into the displayed message or the compose editor (after src/text.js) by background.js.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, unwrap, SKIP_TAGS, SKIP_SELECTOR } = globalThis.TM_TEXT;

  // The part of text node `n` inside `range` (all of it without a range).
  function part(n, range) {
    if (!range) return n.nodeValue;
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
    return n.nodeValue.slice(start, end);
  }

  // Text nodes worth translating, in document order — within `range` when given.
  function walk(skipQuoted, range) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && (!range || range.intersectsNode(n)) && shouldTranslate(part(n, range)) &&
        !(skipQuoted && n.parentElement?.closest(SKIP_SELECTOR))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  // --- Message display: rewrite text nodes in place; toggling restores the Original. ---

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts, note }
  let settingsKey = null;  // provider|target|quoted the translation was made with
  let shown = false;
  let headerEl = null;     // prepended block: translated subject + "Translated: X → Y" note

  function collect(skipQuoted) {
    nodes = walk(skipQuoted);
    originals = nodes.map((n) => n.nodeValue);
    return originals.map((s) => unwrap(splitWhitespace(s)[1]));
  }

  function line(text, style) {
    return Object.assign(document.createElement('div'), { textContent: text, style });
  }

  function apply({ subject, texts, note }) {
    nodes.forEach((n, i) => {
      const [lead, , trail] = splitWhitespace(originals[i]);
      n.nodeValue = lead + (texts[i] ?? splitWhitespace(originals[i])[1]) + trail;
    });
    if (!headerEl) {
      headerEl = line('', 'margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid currentColor');
      if (subject) headerEl.append(line(api.i18n.getMessage('subjectLine', subject), 'font-weight:bold'));
      if (note) headerEl.append(line(note, 'opacity:.7;font-size:.9em'));
    }
    document.body.prepend(headerEl);
    shown = true;
  }

  function restore() {
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    headerEl?.remove();
    shown = false;
  }

  // --- Compose editor: write through execCommand, so one Ctrl+Z reverts a run and Ctrl+Y re-applies it. ---

  let ranges = [];  // one Range per run (or the selection)
  let parts = [];   // per Range: [{ node, text }] — the translatable text nodes and the part of each inside the Range

  // Every text node inside `root` (a fragment), or the body's text nodes intersecting `range`, in document order.
  function textNodes(root, range) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, range
      ? { acceptNode: (n) => (range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) }
      : null);
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  // The selection when there is one (quoted text counts then: it was picked on purpose); otherwise one Range per
  // run of body children holding reply text — a child with text but nothing to translate (quote block, signature)
  // ends a run, children without text (<br>) are neutral.
  function composeRanges() {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) return { selection: true, ranges: [sel.getRangeAt(0)] };
    const root = document.body;
    const childOf = (n) => { while (n.parentNode !== root) n = n.parentNode; return n; };
    const withText = new Set(walk(true).map(childOf));
    const out = [];
    let run = null;
    for (const child of root.childNodes) {
      if (withText.has(child)) {
        if (!run) { run = document.createRange(); run.setStartBefore(child); out.push(run); }
        run.setEndAfter(child);
      } else if (child.textContent.trim()) {
        run = null;
      }
    }
    return { selection: false, ranges: out };
  }

  function composeCollect() {
    const found = composeRanges();
    ranges = found.ranges;
    parts = ranges.map((r) => walk(!found.selection, r).map((node) => ({ node, text: part(node, r) })));
    return { selection: found.selection, texts: parts.flat().map((p) => unwrap(splitWhitespace(p.text)[1])) };
  }

  // Replace each Range with a copy of itself in which only the translatable text nodes carry the Translation. The
  // clone mirrors the Range, so its text nodes pair up with the live ones by index.
  function composeInsert(texts) {
    const sel = window.getSelection();
    let i = 0;
    for (const [k, r] of ranges.entries()) {
      const byNode = new Map(parts[k].map((p) => [p.node, p.text]));
      const frag = r.cloneContents();
      const live = textNodes(document.body, r);
      textNodes(frag).forEach((copy, j) => {
        const text = byNode.get(live[j]);
        if (text === undefined) return;
        const [lead, core, trail] = splitWhitespace(text);
        copy.nodeValue = lead + (texts[i++] ?? core) + trail;
      });
      const div = document.createElement('div');
      div.append(frag);
      sel.removeAllRanges();
      sel.addRange(r);
      if (!document.execCommand('insertHTML', false, div.innerHTML)) return { inserted: false };
    }
    return { inserted: true };
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts, note: msg.note };
        settingsKey = msg.settingsKey;
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
      case 'composeCollect':
        return Promise.resolve(composeCollect());
      case 'composeInsert':
        return Promise.resolve(composeInsert(msg.texts));
      default:
        return undefined;
    }
  });
}
```

- [ ] **Step 4: Background handlers**

In `src/background.js`, replace the `composeState` function and the `composeTranslate` function (with its two-line comment) — everything from `async function composeState(tabId) {` through the closing `}` of `composeTranslate` — with:

```js
async function composeState(tabId) {
  await inject(tabId);
  const { selection } = await messenger.tabs.sendMessage(tabId, { cmd: 'composeCollect' });
  return { selection, suggested: await suggestedLanguage(tabId, await loadSettings()), busy: inFlight.has(tabId) };
}

// Translate the selection, or the whole draft with quoted text and signature excluded, into `lang`. The content
// script writes through the editor, so Ctrl+Z reverts it. No cache: drafts change. Errors are returned, not
// thrown — the popup renders them.
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
    const { texts } = await messenger.tabs.sendMessage(tabId, { cmd: 'composeCollect' });
    if (texts.length === 0) return { error: 'nothingToTranslate' };
    const r = await translateAll(provider, texts, lang, s.creds);
    if (r.detected === lang) return { alreadyIn: lang };
    const { inserted } = await messenger.tabs.sendMessage(tabId, { cmd: 'composeInsert', texts: r.texts });
    if (!inserted) return { error: 'errorGeneric', provider };
    await messenger.storage.local.set({ replyLang: lang });
    return { from: r.detected, to: lang };
  } catch (e) {
    console.error(e);
    return { error: errorKey(e, provider), details: e.message, provider, status: e.status };
  } finally {
    inFlight.delete(tabId);
  }
}
```

- [ ] **Step 5: Locale and popup**

In `_locales/en/messages.json`, after `"translateReply"` add:

```json
  "translateSelection": { "message": "Translate selection" },
```

In `src/compose.js`:
- Replace the two-line header comment with:
  ```js
  // compose_action popup: one language select, one button. The background does all the work, so closing the
  // popup mid-translation cancels nothing. Undo is the editor's own: Ctrl+Z reverts a translation.
  ```
- In `render`, replace `$('go').textContent = t(r.shown ? 'showOriginal' : 'translate');` with `$('go').textContent = t(r.selection ? 'translateSelection' : 'translate');`

- [ ] **Step 6: Checks**

Run: `node --check src/content.js && node --check src/background.js && node --check src/compose.js && npm test`
Expected: no syntax errors; 27/27 PASS. `grep -n "shown\|state'\|reuse\|unchanged" src/background.js src/compose.js` prints nothing (`shown` survives only in `src/content.js`, reading side).

- [ ] **Step 7: Commit**

```bash
git add src/text.js test/text.test.js src/content.js src/background.js src/compose.js _locales/en/messages.json
git commit -m "Compose: write translations through the editor (Ctrl+Z undoes); translate the selection when there is one; skip plain-text quotes"
```

- [ ] **Step 8: STOP — human check (Luka)**

Reload the temporary add-on. In a compose window:
1. **HTML reply**, no selection → Translate → reply text translated, quote / `On … wrote:` / signature / bold / link intact; status `Translated: X → Y`. **Ctrl+Z** → everything back in one step. **Ctrl+Y** → translated again.
2. **Plain-text reply** → same; the `>` quoted lines untouched this time.
3. **Selection**: select part of a sentence (start and end mid-word), open the popup → button reads **Translate selection** → click → only that part is translated; Ctrl+Z reverts it.
4. **Selection inside the quote** → translated (explicit selection wins).
5. **New message** → language preselected to the last one used; `Already in <language>` when the draft is in it; `Nothing to translate` on an empty draft.
6. **Send** a translated plain-text reply to yourself → line breaks intact, quote intact.
7. **Popup closed mid-flight** → reopen → `Translating…` disabled; the translation lands anyway.

---

### Task 5d: Translation quality — punctuation, bare links, pinned Source Language (after the Task 5c smoke test)

Luka's example reply lost the comma after "Hello," (DeepL returned `Pozdrav` for `Hello,` and `dio teksta` for `part of the text.`), and `<b>bold</b>` came back as *lopta* (ball): the item `bold` was auto-detected as Danish on its own, and the overall detection came from the URL `https://github.com/havrlisan`, the longest item. Spec section "Translation quality" describes the three fixes. All pure code in `src/providers.js` and `src/text.js`; both sides benefit.

**Files:**
- Modify: `src/text.js`, `test/text.test.js`
- Modify: `src/providers.js`, `test/providers.test.js`

**Interfaces:**
- `PROVIDERS[id].translate(texts, target, creds, fetchFn, source?)` — new optional 5th argument: ISO 639-1 Source Language to pin (DeepL `source_lang`, Google `source`, Microsoft `from`, Yandex `sourceLanguageCode`); omitted → auto-detect as before.
- `translateAll(providerId, texts, target, creds, fetchFn)` — signature unchanged; behavior: first request = the longest text alone (detection), second round = the rest with `source` pinned, skipped when `detected === target` (those texts come back unchanged); every result passes `keepEnding`.
- `export function keepEnding(src, out)` — re-appends `src`'s trailing `.,;:!?…` when `out` ends with no sentence punctuation.
- `TM_TEXT.shouldTranslate(s)` — additionally `false` for a bare URL or e-mail address.

- [ ] **Step 1: Failing tests — `text.js`**

Append to `test/text.test.js`:

```js
test('shouldTranslate rejects bare URLs and e-mail addresses but not sentences containing them', () => {
  assert.equal(shouldTranslate('https://github.com/havrlisan'), false);
  assert.equal(shouldTranslate('  http://example.com/path?q=1 '), false);
  assert.equal(shouldTranslate('www.example.com'), false);
  assert.equal(shouldTranslate('luka@example.com'), false);
  assert.equal(shouldTranslate('Link: https://github.com/havrlisan'), true);
  assert.equal(shouldTranslate('Write to luka@example.com today'), true);
});
```

Run: `npm test` → this test FAILS (the first four assertions return `true`); everything else passes.

- [ ] **Step 2: `text.js`**

In `src/text.js`, insert before the line `globalThis.TM_TEXT = {`:

```js
// A bare URL or e-mail address: nothing to translate, and its length would make it the detection sample.
const BARE_LINK = /^(?:https?:\/\/\S+|www\.\S+|[^\s@]+@[^\s@]+\.[^\s@]+)$/i;

```

and replace the `shouldTranslate` entry (comment + method) with:

```js
  // Only strings containing a letter — and not a bare link — are worth a Provider call.
  shouldTranslate(s) {
    const core = s.trim();
    return /\p{L}/u.test(core) && !BARE_LINK.test(core);
  },
```

Run: `npm test` → all pass.

- [ ] **Step 3: Failing tests — `providers.js`**

In `test/providers.test.js`:

Change the import line to `import { PROVIDERS, chunk, translateAll, keepEnding, LIMITS, errorKey } from '../src/providers.js';`.

Append to the end of the `google: HTML entities are decoded and nb maps to no` test (before its closing `});`):

```js
  const g = fakeFetch({ data: { translations: [{ translatedText: 'y', detectedSourceLanguage: 'de' }] } });
  await PROVIDERS.google.translate(['x'], 'en', { apiKey: 'K' }, g, 'nb');
  assert.equal(g.calls[0].json.source, 'no');
```

Append to the end of the `microsoft: …` test:

```js
  const h = fakeFetch([{ translations: [{ text: 'x', to: 'en' }] }]);
  await PROVIDERS.microsoft.translate(['x'], 'en', { apiKey: 'K', region: 'westeurope' }, h, 'sr');
  assert.equal(h.calls[0].url, 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en&from=sr-Latn');
```

Append to the end of the `deepl: …` test:

```js
  const i = fakeFetch({ translations: [{ detected_source_language: 'EN', text: 'Hallo' }] });
  await PROVIDERS.deepl.translate(['Hello'], 'de', { apiKey: 'abc' }, i, 'en');
  assert.deepEqual(i.calls[0].json, { text: ['Hello'], target_lang: 'DE', source_lang: 'EN' });
```

Append to the end of the `yandex: …` test:

```js
  const h = fakeFetch({ translations: [{ text: 'x', detectedLanguageCode: 'nb' }] });
  await PROVIDERS.yandex.translate(['x'], 'en', { apiKey: 'K', folderId: 'F' }, h, 'nb');
  assert.equal(h.calls[0].json.sourceLanguageCode, 'no');
```

Replace the whole test `translateAll chunks, concatenates and takes detection from the chunk with the longest text` with these three:

```js
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
```

In the test `translateAll rejects when a provider returns fewer translations than requested`, the first request now carries one text and the fake answers with none; change its assertion to:

```js
    (e) => e.message.includes('1 texts') && e.message.includes('0 translations'),
```

Append a new test:

```js
test('keepEnding restores trailing punctuation the Provider dropped', () => {
  assert.equal(keepEnding('Hello,', 'Pozdrav'), 'Pozdrav,');
  assert.equal(keepEnding('part of the text.', 'dio teksta'), 'dio teksta.');
  assert.equal(keepEnding('Wait...', 'Čekaj'), 'Čekaj...');
  assert.equal(keepEnding('Hello,', 'Pozdrav,'), 'Pozdrav,');
  assert.equal(keepEnding('Really?', '本当に？'), '本当に？');
  assert.equal(keepEnding('Hello', 'Pozdrav'), 'Pozdrav');
  assert.equal(keepEnding('"Hi."', 'Bok'), 'Bok');
});
```

Run: `npm test` → the provider `source` assertions, the three new `translateAll` tests, the changed rejection test and the `keepEnding` test FAIL; everything else passes.

- [ ] **Step 4: `providers.js`**

Each Provider's `translate` gains a 5th parameter `source` (ISO 639-1, may be `undefined`). Apply these exact edits:

google — replace the two lines building the request with:
```js
      const body = { q: texts, target: GOOGLE_TARGET[target] ?? target, format: 'text' };
      if (source) body.source = GOOGLE_TARGET[source] ?? source;
      const data = await postJson(fetchFn, url, {}, body);
```
and the signature with `async translate(texts, target, creds, fetchFn, source) {`.

microsoft — signature `async translate(texts, target, creds, fetchFn, source) {`; replace the `url` line with:
```js
      const from = source ? `&from=${encodeURIComponent(MICROSOFT_TARGET[source] ?? source)}` : '';
      const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(MICROSOFT_TARGET[target] ?? target)}${from}`;
```

deepl — signature `async translate(texts, target, creds, fetchFn, source) {`; after the `const body = …` line add:
```js
      if (source) body.source_lang = source.toUpperCase(); // no regional variants on the source side
```

yandex — signature `async translate(texts, target, creds, fetchFn, source) {`; after the `const body = …` line add:
```js
      if (source) body.sourceLanguageCode = YANDEX_TARGET[source] ?? source;
```

Update the header comment's second line to: `// Each \`translate\` handles ONE request, auto-detecting unless \`source\` is given; \`translateAll\` detects, pins and chunks.`

Replace the whole `translateAll` function with:

```js
// DeepL drops the trailing punctuation of short fragments ("Hello," → "Pozdrav"); put it back when the
// Translation ends without any sentence punctuation of its own.
export function keepEnding(src, out) {
  const m = /[.,;:!?…]+$/.exec(src);
  return m && !/[.,;:!?…。！？、]$/.test(out) ? out + m[0] : out;
}

const code = (s) => (s || '').toLowerCase().split('-')[0];

function checked(r, part) {
  if (r.texts.length !== part.length) throw new Error(`Provider returned ${r.texts.length} translations for ${part.length} texts`);
  return r;
}

// Detect on the longest text alone, then translate the rest with the Source Language pinned: a short fragment
// ("bold") auto-detected on its own is a coin toss. Nothing is sent twice, and the second round is skipped when
// the text is already in the Target Language (those texts come back unchanged).
export async function translateAll(providerId, texts, target, creds, fetchFn = fetch) {
  const provider = PROVIDERS[providerId];
  if (!texts.length) return { texts: [], detected: '' };
  const best = longestIndex(texts);
  const first = checked(await provider.translate([texts[best]], target, creds, fetchFn), [texts[best]]);
  const detected = code(first.detected);
  const out = texts.slice();
  out[best] = first.texts[0];
  if (detected !== target) {
    const rest = texts.map((_, i) => i).filter((i) => i !== best);
    let k = 0;
    for (const part of chunk(rest.map((i) => texts[i]))) {
      const r = checked(await provider.translate(part, target, creds, fetchFn, detected || undefined), part);
      for (const t of r.texts) out[rest[k++]] = t;
    }
  }
  return { texts: out.map((t, i) => keepEnding(texts[i], t)), detected };
}
```

Run: `npm test` → all pass — 31 tests (27 before + 1 `shouldTranslate` + 3 `translateAll` − 1 replaced + 1 `keepEnding`; the `source` assertions live inside existing tests).

- [ ] **Step 5: Checks and commit**

Run: `node --check src/providers.js && node --check src/text.js && npm test`
Expected: all PASS, output pristine.

```bash
git add src/text.js test/text.test.js src/providers.js test/providers.test.js
git commit -m "Translation quality: keep trailing punctuation, skip bare links, pin the Source Language after detecting on the longest text"
```

- [ ] **Step 6: STOP — human check (Luka)**

Reload the temporary add-on, reply to the example message again (HTML and plain text) → `Pozdrav,` keeps its comma, `dio teksta.` its period, *bold* → *podebljani* (or similar), the URL untouched; status `Translated: English → Croatian`. Reading side: translate one message → still fine, "Already in" on a Croatian message makes one request only (check the add-on console's network tab if curious).

---

### Task 5e: Compose side sends the reply as HTML (Provider HTML mode) — sentence context with formatting kept

After Task 5d, `<b>bold</b>` still came back as *podebljano* (neutral form): the sentence was split by inline formatting into three items, so the word had no sentence around it. Luka chose Provider HTML mode with the reply's own markup (spec sections "Translating the draft", "`content.js`", "Translation quality"). Each run of reply text now goes to the Provider as one HTML item (split only at line/block boundaries when oversized), comes back as HTML, is sanitized, and is inserted with `insertHTML` as before. Quoted blocks and signatures inside a sent range are lifted out behind empty placeholders and put back afterwards. The reading side is unchanged (text mode).

**Files:**
- Modify: `src/providers.js`, `test/providers.test.js`
- Rewrite: `src/content.js` (full file below)
- Modify: `src/background.js` (`import`, `composeState`, `composeTranslate`)

**Interfaces:**
- `PROVIDERS[id].translate(texts, target, creds, fetchFn, { source, html } = {})` — the 5th argument becomes an options object. `html: true` → DeepL `tag_handling: 'html'`, Google `format: 'html'` (and no entity decoding of the result), Microsoft `&textType=html`, Yandex `format: 'HTML'`.
- `translateAll(providerId, texts, target, creds, fetchFn = fetch, { html = false } = {})` — passes `html` to every request; `keepEnding` applies in text mode only.
- Content protocol: `{ cmd: 'composeCollect', max }` → `{ selection, texts }` where `texts` are HTML strings (one or more per Range); `{ cmd: 'composeInsert', texts }` → `{ inserted }` with `texts` the translated HTML strings in the same order.

- [ ] **Step 1: Failing tests — `providers.js`**

In `test/providers.test.js`:

The four `source` calls added in Task 5d now pass an options object — change exactly these four call sites:
- google: `…, g, 'nb');` → `…, g, { source: 'nb' });`
- microsoft: `…, h, 'sr');` → `…, h, { source: 'sr' });`
- deepl: `…, i, 'en');` → `…, i, { source: 'en' });`
- yandex: `…, h, 'nb');` → `…, h, { source: 'nb' });`

Append to the end of the `google: HTML entities are decoded and nb maps to no` test:

```js
  const k = fakeFetch({ data: { translations: [{ translatedText: '<b>y</b> &amp; z', detectedSourceLanguage: 'de' }] } });
  const rh = await PROVIDERS.google.translate(['<b>x</b> &amp; z'], 'en', { apiKey: 'K' }, k, { html: true });
  assert.equal(k.calls[0].json.format, 'html');
  assert.deepEqual(rh.texts, ['<b>y</b> &amp; z']); // HTML mode: the markup comes back as is, no entity decoding
```

Append to the end of the `microsoft: …` test:

```js
  const m = fakeFetch([{ translations: [{ text: '<b>y</b>', to: 'en' }] }]);
  await PROVIDERS.microsoft.translate(['<b>x</b>'], 'en', { apiKey: 'K', region: 'westeurope' }, m, { html: true });
  assert.equal(m.calls[0].url, 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en&textType=html');
```

Append to the end of the `deepl: …` test:

```js
  const j = fakeFetch({ translations: [{ detected_source_language: 'EN', text: '<b>Hallo</b>' }] });
  await PROVIDERS.deepl.translate(['<b>Hello</b>'], 'de', { apiKey: 'abc' }, j, { html: true, source: 'en' });
  assert.deepEqual(j.calls[0].json, { text: ['<b>Hello</b>'], target_lang: 'DE', source_lang: 'EN', tag_handling: 'html' });
```

Append to the end of the `yandex: …` test:

```js
  const m = fakeFetch({ translations: [{ text: '<b>y</b>', detectedLanguageCode: 'en' }] });
  await PROVIDERS.yandex.translate(['<b>x</b>'], 'en', { apiKey: 'K', folderId: 'F' }, m, { html: true });
  assert.equal(m.calls[0].json.format, 'HTML');
```

Append a new test after `translateAll skips the second round …`:

```js
test('translateAll in HTML mode passes the flag to every request and leaves punctuation to the Provider', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ format: body.format, source: body.source });
    return { ok: true, status: 200, json: async () => ({ data: { translations: body.q.map((s) => ({ translatedText: s.replace('Hello,', 'Bok'), detectedSourceLanguage: 'en' })) } }) };
  };
  const r = await translateAll('google', ['Hello,', '<p>Hello, again and more</p>'], 'hr', { apiKey: 'K' }, fetchFn, { html: true });
  assert.deepEqual(calls, [{ format: 'html', source: undefined }, { format: 'html', source: 'en' }]);
  assert.deepEqual(r, { texts: ['Bok', '<p>Bok again and more</p>'], detected: 'en' }); // text mode would have made it 'Bok,'
});
```

Run: `npm test` → the four changed `source` call sites FAIL (the string `'nb'` is no longer read as an object — `source` is not set), the HTML assertions FAIL, the new test FAILS; everything else passes.

- [ ] **Step 2: `providers.js`**

google — signature and body:
```js
    async translate(texts, target, creds, fetchFn, { source, html } = {}) {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(creds.apiKey)}`;
      const body = { q: texts, target: GOOGLE_TARGET[target] ?? target, format: html ? 'html' : 'text' };
      if (source) body.source = GOOGLE_TARGET[source] ?? source;
      const data = await postJson(fetchFn, url, {}, body);
      const t = data.data.translations;
      return { texts: t.map((x) => (html ? x.translatedText : decodeEntities(x.translatedText))), detected: t[longestIndex(texts)]?.detectedSourceLanguage };
    },
```

microsoft — signature and URL:
```js
    async translate(texts, target, creds, fetchFn, { source, html } = {}) {
      const from = source ? `&from=${encodeURIComponent(MICROSOFT_TARGET[source] ?? source)}` : '';
      const type = html ? '&textType=html' : '';
      const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(MICROSOFT_TARGET[target] ?? target)}${from}${type}`;
```
(the rest of the function unchanged)

deepl — signature `async translate(texts, target, creds, fetchFn, { source, html } = {}) {`; after the `source_lang` line add:
```js
      if (html) body.tag_handling = 'html';
```

yandex — signature `async translate(texts, target, creds, fetchFn, { source, html } = {}) {`; after the `sourceLanguageCode` line add:
```js
      if (html) body.format = 'HTML'; // per Yandex's API reference (PLAIN_TEXT is the default); unverified live, like the rest of Yandex
```

Update the `decodeEntities` comment to: `// Google v2 escapes HTML entities in text mode (format=text); in HTML mode the markup comes back as is.`

`keepEnding` comment: change the first line to `// Text mode only (HTML mode sends whole sentences): DeepL drops the trailing punctuation of short fragments`.

`translateAll` — signature and the three places that call `translate` / map the result:
```js
export async function translateAll(providerId, texts, target, creds, fetchFn = fetch, { html = false } = {}) {
  const provider = PROVIDERS[providerId];
  if (!texts.length) return { texts: [], detected: '' };
  const best = longestIndex(texts);
  const first = checked(await provider.translate([texts[best]], target, creds, fetchFn, { html }), [texts[best]]);
  const detected = code(first.detected);
  const out = texts.slice();
  out[best] = first.texts[0];
  if (detected !== target) {
    const rest = texts.map((_, i) => i).filter((i) => i !== best);
    let k = 0;
    for (const part of chunk(rest.map((i) => texts[i]))) {
      const r = checked(await provider.translate(part, target, creds, fetchFn, { source: detected || undefined, html }), part);
      for (const t of r.texts) out[rest[k++]] = t;
    }
  }
  return { texts: out.map((t, i) => (html ? t : keepEnding(texts[i], t))), detected };
}
```

Run: `npm test` → all pass (32 tests).

- [ ] **Step 3: Rewrite `src/content.js`**

Replace the whole file with:

```js
// Injected into the displayed message or the compose editor (after src/text.js) by background.js.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, unwrap, SKIP_TAGS, SKIP_SELECTOR } = globalThis.TM_TEXT;

  // Text nodes worth translating, in document order — within `range` when given.
  function walk(skipQuoted, range) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && (!range || range.intersectsNode(n)) && shouldTranslate(n.nodeValue) &&
        !(skipQuoted && n.parentElement?.closest(SKIP_SELECTOR))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  // --- Message display: rewrite text nodes in place; toggling restores the Original. ---

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts, note }
  let settingsKey = null;  // provider|target|quoted the translation was made with
  let shown = false;
  let headerEl = null;     // prepended block: translated subject + "Translated: X → Y" note

  function collect(skipQuoted) {
    nodes = walk(skipQuoted);
    originals = nodes.map((n) => n.nodeValue);
    return originals.map((s) => unwrap(splitWhitespace(s)[1]));
  }

  function line(text, style) {
    return Object.assign(document.createElement('div'), { textContent: text, style });
  }

  function apply({ subject, texts, note }) {
    nodes.forEach((n, i) => {
      const [lead, , trail] = splitWhitespace(originals[i]);
      n.nodeValue = lead + (texts[i] ?? splitWhitespace(originals[i])[1]) + trail;
    });
    if (!headerEl) {
      headerEl = line('', 'margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid currentColor');
      if (subject) headerEl.append(line(api.i18n.getMessage('subjectLine', subject), 'font-weight:bold'));
      if (note) headerEl.append(line(note, 'opacity:.7;font-size:.9em'));
    }
    document.body.prepend(headerEl);
    shown = true;
  }

  function restore() {
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    headerEl?.remove();
    shown = false;
  }

  // --- Compose editor: each run of reply text goes to the Provider as HTML (so sentences keep their inline
  // formatting and their context) and comes back as HTML, written through execCommand so one Ctrl+Z reverts a
  // run and Ctrl+Y re-applies it. ---

  let ranges = [];   // one Range per run (or the selection)
  let counts = [];   // per Range: how many HTML items it was split into
  let kept = [];     // subtrees lifted out of the sent HTML (quote block, signature), by placeholder id
  let keptSpan = []; // per Range: [first, end) of its ids in `kept`

  // Where an oversized run may be split: only between lines / blocks, never inside a sentence.
  const BREAK = 'br, div, p, ul, ol, table, pre, hr, h1, h2, h3, h4, h5, h6, blockquote';

  const outer = (node) => { const div = document.createElement('div'); div.append(node); return div.innerHTML; };

  // The selection when there is one (quoted text counts then: it was picked on purpose); otherwise one Range per
  // run of body children holding reply text — a child with text but nothing to translate (quote block, signature)
  // ends a run, children without text (<br>) are neutral.
  function composeRanges() {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) return { selection: true, ranges: [sel.getRangeAt(0)] };
    const root = document.body;
    const childOf = (n) => { while (n.parentNode !== root) n = n.parentNode; return n; };
    const withText = new Set(walk(true).map(childOf));
    const out = [];
    let run = null;
    for (const child of root.childNodes) {
      if (withText.has(child)) {
        if (!run) { run = document.createRange(); run.setStartBefore(child); out.push(run); }
        run.setEndAfter(child);
      } else if (child.textContent.trim()) {
        run = null;
      }
    }
    return { selection: false, ranges: out };
  }

  // HTML items for one Range: its cloned contents, skipped subtrees replaced by empty placeholders, split only at
  // line / block boundaries once an item exceeds `max` characters (a single oversized block goes alone).
  function items(r, skipQuoted, max) {
    const frag = r.cloneContents();
    if (skipQuoted) {
      for (const el of frag.querySelectorAll(SKIP_SELECTOR)) {
        if (el.parentElement?.closest(SKIP_SELECTOR)) continue; // nested inside a subtree already lifted
        const ph = document.createElement('span');
        ph.dataset.tm = String(kept.push(el) - 1);
        el.replaceWith(ph);
      }
    }
    const out = [];
    let cur = '';
    for (const child of [...frag.childNodes]) {
      const html = outer(child);
      if (cur && cur.length + html.length > max && child.nodeType === 1 && child.matches(BREAK)) { out.push(cur); cur = ''; }
      cur += html;
    }
    if (cur) out.push(cur);
    return out;
  }

  function composeCollect(max) {
    const found = composeRanges();
    const skipQuoted = !found.selection;
    kept = [];
    keptSpan = [];
    ranges = found.ranges.filter((r) => walk(skipQuoted, r).length);
    const texts = [];
    counts = ranges.map((r) => {
      const from = kept.length;
      const it = items(r, skipQuoted, max);
      keptSpan.push([from, kept.length]);
      texts.push(...it);
      return it.length;
    });
    return { selection: found.selection, texts };
  }

  // Provider HTML back into the draft. Only the markup we sent can come back, but be strict anyway: no scripts,
  // no event handlers, no javascript: links. Lifted subtrees return in place of their placeholders (`used` collects
  // the ids seen, so a placeholder the Provider dropped can be appended by the caller).
  function clean(html, used) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of doc.querySelectorAll('script, style, iframe, object, embed, link, meta')) el.remove();
    for (const el of doc.body.querySelectorAll('*')) {
      for (const a of [...el.attributes]) {
        if (/^on/i.test(a.name) || (/^(href|src|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      }
    }
    for (const ph of doc.body.querySelectorAll('span[data-tm]')) {
      const id = Number(ph.dataset.tm);
      used.add(id);
      ph.replaceWith(kept[id] ?? '');
    }
    return doc.body.innerHTML;
  }

  function composeInsert(texts) {
    if (texts.length !== counts.reduce((a, b) => a + b, 0)) return { inserted: false };
    const sel = window.getSelection();
    let i = 0;
    for (const [k, r] of ranges.entries()) {
      const used = new Set();
      let html = texts.slice(i, i + counts[k]).map((t) => clean(t, used)).join('');
      i += counts[k];
      const [from, end] = keptSpan[k];
      for (let id = from; id < end; id++) if (!used.has(id)) html += outer(kept[id]);
      sel.removeAllRanges();
      sel.addRange(r);
      if (!document.execCommand('insertHTML', false, html)) return { inserted: false };
    }
    return { inserted: true };
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts, note: msg.note };
        settingsKey = msg.settingsKey;
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
      case 'composeCollect':
        return Promise.resolve(composeCollect(msg.max ?? 10000));
      case 'composeInsert':
        return Promise.resolve(composeInsert(msg.texts));
      default:
        return undefined;
    }
  });
}
```

No unit test (DOM); Step 6 covers it.

- [ ] **Step 4: Background**

In `src/background.js`:
- First line: `import { PROVIDERS, translateAll, errorKey, LIMITS } from './providers.js';`
- In `composeState`, the `composeCollect` message becomes `{ cmd: 'composeCollect', max: LIMITS.maxChars }`.
- In `composeTranslate`: the `composeCollect` message becomes `{ cmd: 'composeCollect', max: LIMITS.maxChars }`, and the `translateAll` call becomes `const r = await translateAll(provider, texts, lang, s.creds, fetch, { html: true });`.
- In the comment above `composeTranslate`, replace the first sentence with: `// Translate the selection, or the whole draft with quoted text and signature excluded, into \`lang\`. Each run goes as HTML so sentences keep their inline formatting and their context.`

- [ ] **Step 5: Checks and commit**

Run: `node --check src/providers.js && node --check src/content.js && node --check src/background.js && npm test`
Expected: no syntax errors; 32/32, output pristine.

```bash
git add src/providers.js test/providers.test.js src/content.js src/background.js
git commit -m "Compose: send each run as HTML in the Provider's HTML mode, sanitize the result; quotes and signatures lifted out behind placeholders"
```

- [ ] **Step 6: STOP — human check (Luka)**

Reload the temporary add-on. In a compose window:
1. **HTML reply** to the example message → *bold* now agrees with its sentence (e.g. *podebljani dio teksta*), `Pozdrav,` keeps the comma, the link is a link, bold is bold; quote / `On … wrote:` / signature untouched. Ctrl+Z → one step back; Ctrl+Y → again.
2. **Plain-text reply** → same; the literal `<b>bold</b>` text stays literal; `>` quoted lines untouched.
3. **Selection** mid-sentence → only that part; Ctrl+Z reverts.
4. **Selection spanning into the quote** → the selected quote text is translated too, its markup intact.
5. **Long reply** (paste ~12 000 characters of paragraphs) → translates; note in the add-on console's network tab that items were split at paragraph boundaries; one Ctrl+Z still reverts the run.
6. **Send** a translated HTML reply and a plain-text one to yourself → formatting / line breaks / quote intact in the received mail.

---

### Task 6: Docs, roadmap, version, package

**Files:**
- Modify: `README.md`, `ROADMAP.md`, `manifest.json`, `package.json`, `_locales/en/messages.json`
- Create: `docs/smoke-test-0.3.0.md`

- [ ] **Step 1: README**

After the paragraph starting "The button is also bound to **Ctrl+Shift+X**", insert:

```markdown
In a compose window, the **Translate reply** button translates what you wrote into the language of the message you are answering (preselected when you translated that message; pick any language otherwise). Select some text first to translate only that. Your reply is sent with its own formatting (as HTML), so bold text and links stay where they are and sentences are translated whole; quoted text and your signature are never sent unless you selected them. Bare links and e-mail addresses on their own are skipped. Quoted text and your signature are left alone (unless selected), the subject is not touched, and the translation is written through the editor, so **Ctrl+Z** undoes it and Ctrl+Y brings it back.
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

2. **Reply, known language** → translate a foreign message on the reading side, Reply → **Translate reply** button → popup preselects that Source Language → Translate → your text translated in place; quoted block, `On … wrote:`, signature, bold and links untouched; nothing inserted above your text; status `Translated: X → Y`.
3. **Undo / redo** → Ctrl+Z → everything back in one step; Ctrl+Y → translated again.
4. **Selection** → select part of a sentence (mid-word boundaries), open the popup → button reads `Translate selection` → only that part is translated; Ctrl+Z reverts. A selection inside the quote is translated too.
5. **New message** → language preselected to the last one used.
6. **Already in** → draft in the picked language → `Already in <language>`, untouched.
7. **Empty draft** → `Nothing to translate`.
8. **Bad key** → break the key in Options → Provider error text in the popup, raw response in its tooltip. Fix the key.
9. **No Provider configured** → clear the key → Translate → Options page opens, popup says `Set up a Provider in the add-on settings first`. Restore the key.
10. **Plain-text compose** → steps 2–4; the `>` quoted lines stay untouched.
11. **Popup closed mid-flight** → long draft, Translate, close popup at once, reopen → `Translating…`, button disabled; the translation lands anyway.
12. **Send** → send a translated reply to yourself, HTML and plain text → received body is the translation with its line breaks, quoted part original.
13. **Fragments** → reply `Hello,` / `this is an example message.` / `Link: https://github.com/havrlisan` / `This is a <b>bold</b> part of the text.` (HTML) → comma and period kept, *bold* agrees with its sentence and is still bold, the link still a link, status shows the right Source Language.
14. **Long reply** → paste ~12 000 characters of paragraphs → translated; one Ctrl+Z reverts the run.
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
