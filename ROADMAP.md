# Roadmap

Ideas for future releases, roughly ordered by value ÷ effort within each section. Nothing here is committed.

Already settled elsewhere and deliberately not listed: auto-translate on open, privacy consent / sender exclusions, auto-showing cached Translations (all deferred to v3); an ad-hoc Target Language picker (not planned); HTML-mode translation (never — text nodes only).

## Translation quality

2. **Join hard-wrapped plain-text lines.** Plain-text mail renders as one `<pre>` / `.moz-text-flowed` block where every wrapped line is its own text node split by `<br>`, so each line is translated as a sentence fragment. Join sibling text nodes separated only by `<br>` within the same parent, translate once, write the result into the first node and blank the others. Verify TB's actual rendering on a real plain-text message first.
   - Known limitation that stays: inline formatting in HTML mail (`Please <b>do not</b> reply`) splits sentences too; fixing that needs HTML mode. Document it in the README if it shows up in practice.
3. **Per-item language detection.** Bilingual mail (e.g. English body, Croatian quoted reply) currently reports one Source Language from the longest item. Pass per-item `detected` through and report "already in target" only when all items are.

## UX

4. **"Test" button in Options.** Send `"Hello"` with the current credentials and show ✓ or the error next to the fields, so a wrong key is caught at setup rather than on the first click. Reuses `showError`'s status mapping.
5. **Keyboard shortcut.** Manifest only: `"commands": { "_execute_message_display_action": { "suggested_key": { "default": "Ctrl+Shift+T" } } }`. Rebindable in Thunderbird's shortcut manager.
6. **Translate selection only.** Context menu on selected message text → "Translate selection". Same in-place text-node mechanism, restricted to nodes intersecting the selection. Needs the `menus` permission.
7. **Show DeepL usage.** `GET /v2/usage` returns `character_count` / `character_limit`; show "312 400 / 500 000 characters used this month" in Options. DeepL only — the other Providers don't expose it.
8. **Character count while translating.** Button label `Translating… (4.2k chars)` so users get a feel for what a click costs against their quota.
9. **Localize the add-on's own UI.** `_locales` has only `en`; add `hr` and `de` at least.

## Bigger features (v2)

10. **Compose side: translate my reply.** A `compose_action` button that translates the draft body into the Source Language of the message being replied to (already known from `detectedByTab`) or a picked language. Needs the `compose` permission and `getComposeDetails` / `setComposeDetails`. Completes the read-then-answer loop; the headline feature for v2.
11. **Self-hosted / custom endpoint Provider.** A user-configured LibreTranslate- (or DeepLX-) compatible URL, optional key. Different from the rejected keyless Provider: it is the user's own server, and "mail never leaves my network" is a real selling point. Cost: URL field plus `optional_host_permissions` and `permissions.request()` at save time, since arbitrary hosts cannot be pre-declared. Decide first whether this counts as the same thing as the settled "no keyless Provider".
12. **Formality.** DeepL `formality` (`more` / `less`), with Google/Microsoft equivalents where available. Single "Formal / informal" option. Glossaries: only if someone asks.

## Small polish

- Cache key falls back to `msg.id` (or skips caching) when `headerMessageId` is missing, so such messages don't all collide on one key.
- Extend `LANGUAGES` (e.g. `ca`, `fa`, `hi`, `ms`, `bn`); `Intl.DisplayNames` already names any code and Provider errors cover unsupported ones.
- `error.html` popup → `notifications.create()` for the common "network down" case would be less intrusive, at the cost of the details text. Leave unless it annoys.

## Suggested next release

2 + 4 + 5: all small, improve either quality or first-run experience, none touch the settled decisions. Plan 10 as the v2 headline.
