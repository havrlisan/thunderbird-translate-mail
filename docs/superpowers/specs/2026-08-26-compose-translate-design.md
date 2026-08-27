# Translate Mail — Compose side: translate my reply (v2, confirmed 2026-08-26, redesigned 2026-08-27)

Roadmap item 10. Glossary: see `CONTEXT.md`. Builds on the v1 design (`2026-08-25-translate-mail-design.md`); everything not mentioned here stays as it is.

History: the first build (2026-08-26) mirrored the reading side — a "Show original" toggle over direct text-node writes. The smoke test showed the toggle discarding edits made to the Translation, and Luka preferred the editor's own undo. A spike confirmed `document.execCommand('insertHTML')` over a Range is reverted by one Ctrl+Z in both HTML and plain-text compose, so the compose side now writes through the editor and has no toggle.

## Product
- A `compose_action` button in the compose window toolbar, same icon, title "Translate reply". Clicking it opens a popup (`src/compose.html`) — no direct action, no keyboard shortcut in this release (`_execute_compose_action` is one manifest line; a key is picked only after a manual check, cf. the Alt+Shift gotcha).
- New permission `compose` (read the draft's related message, inject into the compose editor). `messagesRead` is already granted. Version 0.3.0.
- **Undo, not toggle.** The translation is written through the editor, so **Ctrl+Z reverts it and Ctrl+Y re-applies it** — one step per run of reply text (one step for a normal top- or bottom-posted reply; interleaved replies give one per block). There is no "Show original" on the compose side.
- **Selection.** If text is selected in the editor when Translate is clicked, only the selection is translated (quoted text included — it was picked on purpose). Otherwise the whole reply is translated with quoted text and signatures skipped.

## Popup
- One language `<select>` (same `LANGUAGES` list and `Intl.DisplayNames` naming as Options), one button, one status line. Shares `style.css` and `theme.js`.
- On open the popup finds its compose tab (`tabs.query({ active: true, currentWindow: true })`) and asks the background `{ cmd: 'composeState', tabId }` → `{ suggested, busy, selection }`. The select is preselected to `suggested`; the button reads "Translate selection" when `selection` is true, else "Translate".
- Clicking the button sends `{ cmd: 'composeTranslate', tabId, lang }` and renders the reply:
  - `{ from, to }` → status "Translated: <from> → <to>" (existing `translatedNote`).
  - `{ alreadyIn }` → status "Already in <language>".
  - `{ error: 'nothingToTranslate' | 'setupFirst' | <errorKey>, details, provider, status }` → status shows the i18n text (Provider name and HTTP status substituted as on the reading side), tooltip shows `details`. `setupFirst` additionally means the background opened the Options page.
  - `{ busy: true }` → status "Translating…", button disabled.
  - A `suggested` code outside `LANGUAGES` (a detected language the list lacks) is added to the select on the fly.
- Button disabled and status "Translating…" while waiting. All work runs in the background, so the popup closing mid-flight cancels nothing. A popup reopened mid-flight shows "Translating…" with the button disabled (it does not refresh by itself; reopen it later).

## Suggested language
`getComposeDetails(tabId).relatedMessageId` → `messages.get(id).headerMessageId` → `cachedDetected(cache, headerMessageId)` — a pure helper in `cache.js` that returns the `detected` of any cache entry whose key starts with `<headerMessageId>|` (the reading side already stores it). Falls back to `storage.local.replyLang` (saved after each successful compose translation), then to the Target Language. No new state beyond `replyLang`.

## Translating the draft
- Background handler for `composeTranslate`, guarded by the same `inFlight` set as the reading side:
  1. Load settings (`loadSettings()`, shared with the reading side). Missing credentials → `runtime.openOptionsPage()`, reply `{ error: 'setupFirst' }`.
  2. `scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] })` into the compose tab, then `tabs.sendMessage(tabId, { cmd: 'composeCollect', max: LIMITS.maxChars })` → `{ selection, texts }` — `texts` are HTML strings, one or more per run. Empty → reply `{ error: 'nothingToTranslate' }`.
  3. `translateAll(provider, texts, lang, creds, fetch, { html: true })` — the Provider's HTML mode (DeepL `tag_handling: 'html'`, Google `format: 'html'`, Microsoft `textType=html`, Yandex `format: 'HTML'`, the last unverified live). `detected === lang` → reply `{ alreadyIn: lang }`, draft untouched.
  4. `tabs.sendMessage(tabId, { cmd: 'composeInsert', texts })` → `{ inserted }`; `inserted` false → reply `{ error: 'errorGeneric', provider }`. Save `replyLang`; reply `{ from: detected, to: lang }`.
  5. Any throw → `console.error`, reply `{ error: errorKey(e, provider), details: e.message, provider, status }`.
  - Tab already in flight → reply `{ busy: true }` without touching anything.
- `composeState` handler: inject the same scripts (idempotent), `composeCollect` for `selection`, `suggested` as above, `busy: inFlight.has(tabId)`.
- The subject is never touched. No cache on the compose side: drafts change.

## `content.js`
The reading side keeps its 0.2.0 logic unchanged (`toggle` / `apply`, direct text-node writes, header block with subject and note). The compose side adds two commands:
- **`composeCollect`** `{ max }` → `{ selection, texts }`. If the editor selection is non-collapsed, the one Range is a *clone* of the selection (the live one moves with the caret) and quoted text is not skipped. Otherwise one Range per *run*: consecutive `document.body` children that hold translatable text (quoted text and signatures skipped via `SKIP_SELECTOR`); a child with text but nothing to translate — a quote block, a signature — ends a run; children without text (`<br>`) are neutral. Ranges with nothing translatable are dropped. Each Range's cloned contents become HTML items: subtrees matching `SKIP_SELECTOR` (only possible when the body is wrapped in one element) are lifted out behind empty `<span data-tm="n">` placeholders; the HTML is split into several items only at line/block boundaries (`br`, `div`, `p`, lists, tables, `pre`, `hr`, headings, `blockquote`) once an item would exceed `max` characters — never inside a sentence; a single oversized block goes alone. The Ranges, item counts and lifted subtrees are remembered for `composeInsert`.
- **`composeInsert`** `{ texts }` → `{ inserted }`. `texts` must have exactly as many items as collected, and every Range's current HTML must equal the snapshot taken at collect time — checked for all Ranges before anything is written (else `inserted: false`). Per Range: each returned item is parsed with `DOMParser` and sanitized — `script`/`style`/`iframe`/`object`/`embed`/`link`/`meta`/`base`/`form`/`input`/`button`/`svg` removed, `on*` attributes stripped, URL attributes (`href`/`src`/`action`/`formaction`, incl. `xlink:`) kept only for mail-safe schemes (`SAFE_URL` in `text.js`: http(s), mailto, cid, tel, fragment, relative, `data:image/`; tab/CR/LF removed before the check) — placeholders are replaced by their lifted subtrees (a placeholder the Provider dropped is appended at the end of the run), the items are joined, the Range is selected and `document.execCommand('insertHTML', false, html)` writes it. `inserted` is false if `execCommand` reports failure; nothing is written directly.
- Why the reply's own markup (decision 2026-08-27): sending text nodes one by one left `<b>bold</b>` without its sentence (*podebljano*); Provider HTML mode keeps inline formatting in place and translates whole sentences. This overturns "never HTML mode" for the compose side only: the reading side still sends bare text-node strings and never inserts Provider HTML into a displayed message. Cost: markup characters are billed (`<br>`, `<a href>`, pasted inline styles).
- `text.js` `SKIP_SELECTOR` gains `span[_moz_quote]`: the plain-text compose editor wraps a quotation in `<span _moz_quote="true">` (Gecko `HTMLEditor::InsertAsPlaintextQuotation`), not `blockquote[type=cite]`; only the "On … wrote:" line carries `.moz-cite-prefix`.

## Translation quality (2026-08-27, after the compose smoke test; applies to both sides)
The example reply `Hello, / this is an example message. / Link: <url> / This is a <b>bold</b> part of the text.` showed three Provider-side effects of translating text nodes one by one:
- **Trailing punctuation.** DeepL returned `Pozdrav` for `Hello,` and `dio teksta` for `part of the text.`. `translateAll` re-appends the source's trailing `.,;:!?…` when the Translation ends with no sentence punctuation of its own (`keepEnding`).
- **Bare links.** `https://github.com/havrlisan` was the longest item, so the whole detection came from a URL (`id`). `shouldTranslate` rejects bare URLs and e-mail addresses (`BARE_LINK`); sentences containing a link are still sent whole.
- **Pinned Source Language.** `bold` on its own was detected as Danish and became *lopta* (ball). `translateAll` now makes one request for the longest text alone (that is the detection), then one chunked round for the rest with the Source Language pinned — every Provider's `translate` takes an optional `source` (DeepL `source_lang`, Google `source`, Microsoft `from`, Yandex `sourceLanguageCode`). Same characters billed, one extra small request; the second round is skipped when `detected === target`. Trade-off, accepted: a body that mixes two languages outside the quote is translated as one language (the roadmap's "per-item detection" item stays parked until a real report).
- **Sentence context (compose side).** Even with the source pinned, `bold` alone came back as *podebljano* (neutral form). The compose side now sends each run as HTML in the Provider's HTML mode (see `content.js`), so sentences keep their words together and their inline formatting in place. Reading side unchanged.

## Limitations (documented, not fought)
- Typing inside a run while "Translating…" is in progress: `composeInsert` notices the run's HTML no longer matches what was collected and refuses (the popup shows the generic error); nothing is written. Typing elsewhere is unaffected.
- Yandex HTML mode (`format: 'HTML'`) is taken from its API reference, not exercised — Yandex is untested throughout.
- The plain-text compose editor is the same HTML editor internally; `insertHTML` works there too (spike 2026-08-27). Line breaks of a sent plain-text reply are verified by the smoke test, not by code.
- Reopened drafts (`type: 'draft'`) have no related original; the suggestion falls back to `replyLang`.
- A compose tab closed mid-translation surfaces as an error reply to a popup that no longer exists. Harmless.

## Files
`manifest.json`, `src/compose.html`, `src/compose.js`, `src/background.js`, `src/content.js`, `src/text.js`, `src/cache.js`, `test/cache.test.js`, `test/text.test.js`, `_locales/en/messages.json` (`translateReply`, `translateSelection`, `composeInto`, `setupFirst`), `README.md`, `ROADMAP.md` (remove item 10), `docs/smoke-test-0.3.0.md`, version bump.

## Verification
- `node --test`: `SAFE_URL` (allowed vs script-bearing schemes); `cachedDetected` (hit, miss, prefix must match the whole id); `SKIP_SELECTOR` pins `span[_moz_quote]`; `shouldTranslate` rejects bare links; each Provider's `source` parameter; `translateAll` two-round flow (detect, pin, chunk, skip when already in target); `keepEnding` (text mode only); each Provider's HTML-mode parameter and `translateAll`'s `html` pass-through.
- Checked 2026-08-26 on TB 154 (temporary add-on, `compose` permission): `scripting.executeScript` reaches the compose editor for HTML reply, plain-text reply and new message.
- Checked 2026-08-27 on TB 154: `execCommand('insertHTML')` over the run of reply text → one Ctrl+Z reverts, Ctrl+Y re-applies, in both HTML and plain-text compose; quote, signature, bold and links intact.
- Manual smoke test: HTML reply (bold/link kept, sentence context right), plain-text reply (quote untouched, literal tags literal), selection only (mid-node boundaries), selection into the quote, oversized reply split at paragraphs, new mail (no related message → last-used language), "Already in", Ctrl+Z / Ctrl+Y, error with a bad key, popup closed mid-translation, sent HTML and plain-text replies intact.
