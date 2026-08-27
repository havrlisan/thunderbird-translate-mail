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
