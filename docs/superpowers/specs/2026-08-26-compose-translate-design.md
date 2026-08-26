# Translate Mail — Compose side: translate my reply (v2, confirmed 2026-08-26)

Roadmap item 10. Glossary: see `CONTEXT.md`. Builds on the v1 design (`2026-08-25-translate-mail-design.md`); everything not mentioned here stays as it is.

## Product
- A `compose_action` button in the compose window toolbar, same icon, title "Translate reply". Clicking it opens a popup (`src/compose.html`) — no direct action, no keyboard shortcut in this release (`_execute_compose_action` is one manifest line; a key is picked only after a manual check, cf. the Alt+Shift gotcha).
- New permission `compose` (read the draft's related message, inject into the compose editor). `messagesRead` is already granted. Version 0.3.0.

## Popup
- One language `<select>` (same `LANGUAGES` list and `Intl.DisplayNames` naming as Options), one button, one status line. Shares `style.css` and `theme.js`.
- On open the popup finds its compose tab (`tabs.query({ active: true, currentWindow: true })`) and asks the background `{ cmd: 'composeState', tabId }` → `{ shown, suggested }`. Button reads "Translate" when `shown` is false, "Show original" when true. The select is preselected to `suggested`.
- Clicking the button sends `{ cmd: 'composeTranslate', tabId, lang }` and renders the reply:
  - `{ shown: true, from, to }` → status "Translated: <from> → <to>" (existing `translatedNote`), button "Show original".
  - `{ shown: false }` → status empty, button "Translate".
  - `{ alreadyIn }` → status "Already in <language>".
  - `{ error: 'nothingToTranslate' | 'setupFirst' | <errorKey>, details, provider, status }` → status shows the i18n text (Provider name and HTTP status substituted as on the reading side), tooltip shows `details`. `setupFirst` additionally means the background opened the Options page.
  - `{ busy: true }` → status "Translating…", button disabled.
  - A `suggested` code outside `LANGUAGES` (a detected language the list lacks) is added to the select on the fly.
- Button disabled and status "Translating…" while waiting. All work runs in the background, so the popup closing mid-flight cancels nothing; reopening it shows the true state.

## Suggested language
`getComposeDetails(tabId).relatedMessageId` → `messages.get(id).headerMessageId` → `cachedDetected(cache, headerMessageId)` — a new pure helper in `cache.js` that returns the `detected` of any cache entry whose key starts with `<headerMessageId>|` (the reading side already stores it). Falls back to `storage.local.replyLang` (saved after each successful compose translation), then to the Target Language. No new state beyond `replyLang`.

## Translating the draft
- Background handler for `composeTranslate`, guarded by the same `inFlight` set as the reading side:
  1. Load settings (`loadSettings()` extracted from the click handler; both paths use it). Missing credentials → `runtime.openOptionsPage()`, reply `{ error: 'setupFirst' }`.
  2. `scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] })` into the compose tab, then `tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: true, reuse: false, settingsKey })`.
     - `{ shown: false }` without `texts` → the draft was restored; reply `{ shown: false }`.
     - `texts` empty → reply `{ error: 'nothingToTranslate' }`.
  3. `translateAll(provider, texts, lang, creds)`. `detected === lang` → reply `{ alreadyIn: lang }`, draft untouched.
  4. `tabs.sendMessage(tabId, { cmd: 'apply', subject: '', texts, note: '', settingsKey })`; save `replyLang`; reply `{ shown: true, from: detected, to: lang }`.
  5. Any throw → `console.error`, reply `{ error: errorKey(e, provider), details: e.message, provider, status }`.
  - Tab already in flight (popup closed and reopened mid-translation, then clicked again) → reply `{ busy: true }` without touching anything.
- `composeState` handler: inject the same scripts (idempotent), `tabs.sendMessage(tabId, { cmd: 'state' })` → `shown`; compute `suggested` as above; `busy: inFlight.has(tabId)` so a reopened popup shows "Translating…" with the button disabled (it does not refresh by itself; reopen it later).
- Quoted text and signatures (`SKIP_SELECTOR`) are always skipped in compose — they are not the user's reply. The `translateQuoted` option applies to reading only.
- The subject is never touched.
- No cache on the compose side: drafts change.

## `content.js` changes (shared with the reading side)
- `apply`: create the header block only when `subject || note` is non-empty — otherwise an empty bordered `<div>` would be inserted into the draft. Reading side is unaffected (it always passes a note).
- `toggle`: honour `msg.reuse === false` by skipping the "re-apply last Translation" branch, so compose always re-collects and re-translates the current text.
- New `state` command → `{ shown }`.

## Limitations (documented, not fought)
- "Show original" restores the text nodes that still exist; text the user retyped after translating stays as typed. Ctrl+Z does not undo a translation (the editor does not track script edits).
- The plain-text compose editor is the same HTML editor internally; quoted blocks and signatures use the same markup, so the same selectors apply. Not separately handled.
- Reopened drafts (`type: 'draft'`) have no related original; the suggestion falls back to `replyLang`.
- A compose tab closed mid-translation surfaces as an error reply to a popup that no longer exists. Harmless.

## Files
`manifest.json`, `src/compose.html`, `src/compose.js` (~50 lines), `src/background.js` (+~50), `src/content.js` (~4 lines), `src/cache.js` (+1 helper), `test/cache.test.js`, `_locales/en/messages.json` (`translateReply`, `composeInto`, `setupFirst`), `README.md`, `ROADMAP.md` (remove item 10), `docs/smoke-test-0.3.0.md`, version bump.

## Verification
- `node --test`: `cachedDetected` (hit, miss, prefix must match the whole id).
- Plan task 1, before anything else: confirm in TB 154 that `scripting.executeScript` reaches a compose tab with the `compose` permission (temporary add-on, a one-line script). If it does not, stop and switch to the fallback: `getComposeDetails().body` → `DOMParser` → text nodes → `setComposeDetails({ body })`, with a `>`-line path for plain text.
- Manual smoke test: HTML reply, plain-text reply, new mail (no related message → last-used language), draft with signature, "Already in", toggle back, error with a bad key, popup closed mid-translation.
