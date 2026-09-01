# Smoke test — 0.3.0

Install `translate-mail-0.3.0.xpi` via Add-ons and Themes → gear → Install Add-on From File (not Load Temporary Add-on: it does not exercise the packaged build). Updating from 0.2.0 must show a permission prompt for "Read and modify your email messages as they are being composed".

## A. Reading side (regression)

1. Translate / Show original on an HTML message and a plain-text message → as in 0.2.0, including the `Subject:` + `Translated: X → Y` block at the top.
1b. **Cancel** → on a long message click Translate; while it reads `Translating…` the tooltip says `click to cancel` → click again → button back to `Translate`, no error popup, message untouched; Translate again → works.

## B. Compose side

2. **Reply, known language** → translate a foreign message on the reading side, Reply → **Translate reply** button → popup preselects that Source Language → Translate → your text translated in place; quoted block, `On … wrote:`, signature, bold and links untouched; nothing inserted above your text; status `Translated: X → Y`.
3. **Undo / redo** → Ctrl+Z → everything back in one step; Ctrl+Y → translated again.
4. **Selection** → the popup shows the gray selection tip when nothing is selected; select part of a sentence (mid-word boundaries), open the popup → button reads `Translate selection`, tip gone → only that part is translated; Ctrl+Z reverts. A selection inside the quote is translated too.
5. **New message** → language preselected to the last one used.
6. **Already in** → draft in the picked language → `Already in <language>`, untouched.
7. **Empty draft** → `Nothing to translate`.
8. **Bad key** → break the key in Options → Provider error text in the popup, raw response in its tooltip. Fix the key.
9. **No Provider configured** → clear the key → Translate → Options page opens, popup says `Set up a Provider in the add-on settings first`. Restore the key.
10. **Plain-text compose** → steps 2–4; the `>` quoted lines stay untouched.
11. **Popup closed mid-flight** → long draft, Translate, close popup at once, reopen → `Translating…`, button reads `Cancel`; the translation lands anyway.
11b. **Cancel** → long draft, Translate, click `Cancel` → status clears, button `Translate`, draft untouched; Translate again → works. Repeat with the popup closed and reopened mid-flight, cancelling from the reopened popup.
12. **Send** → send a translated reply to yourself, HTML and plain text → received body is the translation with its line breaks, quoted part original.
13. **Fragments** → reply `Hello,` / `this is an example message.` / `Link: https://github.com/havrlisan` / `This is a <b>bold</b> part of the text.` (HTML) → comma and period kept, *bold* agrees with its sentence and is still bold, the link still a link, status shows the right Source Language.
14a. **Interleaved reply edited mid-flight** → reply text both above and below the quote, Translate, and while `Translating…` type into the lower block → the popup shows the generic error and *nothing* was written (neither block).
14b. **Selection, then click away** → select a sentence, Translate, and while `Translating…` click into the editor (collapsing the selection) → the selection is still translated when the Provider answers.
14. **Long reply** → paste ~12 000 characters of paragraphs → translated; one Ctrl+Z reverts the run.
