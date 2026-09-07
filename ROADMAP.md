# Roadmap

Ideas for future releases, roughly ordered by value ÷ effort within each section. Nothing here is committed.

Already settled elsewhere and deliberately not listed: auto-translate on open, privacy consent / sender exclusions, auto-showing cached Translations (all deferred to v3); an ad-hoc Target Language picker (not planned); HTML-mode translation on the reading side (never — text nodes only; the compose side does send the reply's own HTML, see the 0.3.0 spec).

## UX

7. ~~Show DeepL usage.~~ Done in 0.5.0.
8. ~~Character count while translating.~~ Replaced in 0.5.0 by a confirmation above a configurable character threshold (default 20 000): a running count on the button is noise for most users; the real risk is one click on a huge message eating the quota.
9. ~~Localize the add-on's own UI.~~ Done in 0.6.0: `hr`, `de`, `fr`, `es`, `it` (fr/es/it not proofread by a native speaker).

## Bigger features (v2)

11. **Self-hosted / custom endpoint Provider.** A user-configured LibreTranslate- (or DeepLX-) compatible URL, optional key. Different from the rejected keyless Provider: it is the user's own server, and "mail never leaves my network" is a real selling point. Cost: URL field plus `optional_host_permissions` and `permissions.request()` at save time, since arbitrary hosts cannot be pre-declared. Decide first whether this counts as the same thing as the settled "no keyless Provider".
12. **Formality.** DeepL `formality` (`more` / `less`), with Google/Microsoft equivalents where available. Single "Formal / informal" option. Glossaries: only if someone asks.

## Small polish

- **Per-item language detection.** Bilingual mail (e.g. English body, Croatian quoted reply) currently reports one Source Language from the longest item. Pass per-item `detected` through and report "already in target" only when all items are. Demoted: mild since quoted text is skipped by default, and bilingual mail says the same thing twice; needs a real report before touching detection.
- Cache key falls back to `msg.id` (or skips caching) when `headerMessageId` is missing, so such messages don't all collide on one key.
- Extend `LANGUAGES` (e.g. `ca`, `fa`, `hi`, `ms`, `bn`); `Intl.DisplayNames` already names any code and Provider errors cover unsupported ones.
- `dialog.html` error popup → `notifications.create()` for the common "network down" case would be less intrusive, at the cost of the details text. Leave unless it annoys.

## Suggested next release

0.6.0 (tagged, smoke-tested in hr): UI localized to hr, de, fr, es, it. Next: 11.
