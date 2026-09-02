# Smoke test — 0.4.0

Install `translate-mail-0.4.0.xpi` via Add-ons and Themes → gear → Install Add-on From File. Updating from 0.3.0 may show a permission prompt (new `menus` permission; Thunderbird lists it only if it deems it a warning).

## A. Compose shortcut

1. Compose window → **Ctrl+Shift+E** → the Translate reply popup opens. In the main window the key does nothing (no error in the console).

## B. Translate selection (reading side)

2. **Basic** → HTML message, select a sentence, right-click → **Translate selection** → only that part is replaced in place, no `Subject:` / `Translated:` block at the top, button reads `Show original` with `Translated from X` in the tooltip.
3. **Show original** → click the button → the sentence is back, button `Translate`. Click again → the *whole* message is translated (not the snippet re-shown), with the header block.
4. **Over a shown Translation** → with the whole message translated, select a passage, Translate selection → the message first reverts to the original, then only the passage is translated.
5. **Second selection** → with a selection translated, translate another selection → the first reverts, the second is translated (one at a time).
6. **Quoted text** → select inside a quoted block (`Also translate quoted text` unticked) → it is translated anyway.
7. **Cancel** → long selection, Translate selection, click the button while `Translating…` → back to `Translate`, no error popup, message untouched.
8. **Already in / nothing** → select text already in the Target Language → `Already in <language>`; select only a URL → `Nothing to translate`.
9. **Plain-text message** → steps 2–3.
10. **Compose window** → select draft text, right-click → **Translate selection** → the Translate reply popup opens with the button reading `Translate selection`.
11. **Not cached** → after a selection translate, open another message and come back → Translate → `Translating…` (full message, fresh), not instant.

Anything wrong: note the step number and what the header/button showed.
