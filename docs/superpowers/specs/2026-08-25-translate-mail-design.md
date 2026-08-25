# Translate Mail — v1 design (confirmed 2026-08-25)

Glossary: see `CONTEXT.md` (Provider, Target Language, Source Language, Translation, Original).

## Product
- Thunderbird MailExtension (MV3), plain JS, no build step, `_locales/en` from day one.
- Id `translate-mail@luka-havrlisan`, author Luka Havrlisan (luka.havrlisan@gmail.com), `strict_min_version` `128.0`. Personal project; published on ATN once tested.

## Button
- `message_display_action` in the message header toolbar.
- Click → translate subject + body into the configured Target Language. Title becomes "Show original"; click again restores the Original (toggle).
- Badge shows the detected Source Language code (e.g. `DE`). If Source == Target: Original stays, badge `=`, title "Already in <language>".
- No banner is inserted into the message.

## Rendering
- A content script injected into the displayed message collects the body's text nodes (skipping `<script>`/`<style>`, whitespace-only nodes), sends the trimmed strings to the background, and writes translations back in place, preserving leading/trailing whitespace. Markup is never sent to a Provider.
- Translated subject is inserted as a single `Subject: <translated>` line at the top of the body; removed on "Show original".
- A newly displayed message resets the tab's button state (title/badge).

## Providers (bring-your-own-key; all four in v1)
| Provider | Endpoint | Credentials |
|---|---|---|
| Google Cloud Translation v2 | `POST https://translation.googleapis.com/language/translate/v2?key=…` | apiKey |
| Microsoft Translator v3 | `POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=…` | apiKey, region |
| DeepL | `POST https://api-free.deepl.com/v2/translate` (key ending `:fx`) or `https://api.deepl.com/v2/translate` | apiKey |
| Yandex Translate v2 | `POST https://translate.api.cloud.yandex.net/translate/v2/translate` | apiKey, folderId |
- No keyless Provider. Source Language is auto-detected by the Provider and returned with the translation.
- Requests are chunked (≤50 strings, ≤10 000 chars per request — Yandex has the lowest cap) to stay under every Provider's limits. Source Language is taken from the longest string in the batch.

## Options page
- Provider dropdown; credential fields only for the selected Provider; Target Language dropdown from a static list of ISO 639-1 codes with names from `Intl.DisplayNames`; "Clear cache" button.
- Everything stored in `storage.local`.

## Cache
- Key `headerMessageId | provider | target`, value `{subject, texts, detected, at}`, `storage.local`, max 200 entries, oldest evicted.
- A reopened message always shows the Original; clicking applies the cached Translation without a Provider call.

## Errors
- No credentials configured → open the options page.
- Provider/network error → badge `!`, title = error text, message untouched.

## Verification
- `node --test` covering pure logic (text-node filtering/whitespace, chunking, cache eviction, each Provider's request/response mapping with a fake `fetch`).
- Manual end-to-end via Thunderbird 154 → Add-ons Manager → Debug Add-ons → Load Temporary Add-on.

## Deferred
- v3: auto-translate on open, privacy consent/exclusions, auto-showing cached Translation. Not planned: ad-hoc language picker, keyless Provider.

## Known gaps after v1 review (2026-08-25)
- Manual Thunderbird smoke test passed 2026-08-25 (TB 154.0, DeepL): translate / show original / cache / message switch / same-language badge all OK with the default `executeScript` call and temporary-add-on host permissions. Microsoft and Google also verified end-to-end the same day; Yandex deliberately left untested (no credentials).
- Failures open a popup window (`src/error.html`) with a status-specific explanation. Under the System-auto theme it stays light even when Thunderbird is dark: `theme.getCurrent()` returns no colours and extension pages get a light `prefers-color-scheme`. Accepted for v1.
- `translateAll` reports `''` detection if the longest chunk's Provider response lacks it (blank badge, translation still applies).
- `chunk()` never splits a single oversized text node; the whole cache blob is (de)serialised per click; in-flight guard has no timeout; `LIMITS.maxChars` not pinned by a test.
- Switching messages mid-translation shows an error badge once (self-heals on next click); `collect()` runs once per document; empty `messages` list → error badge.
- Options: half-typed keys are persisted (auto-save); "Cache cleared" never auto-clears; `Intl.DisplayNames.of` unguarded.
- `": "` separator in the error title is hard-coded outside `_locales`.
