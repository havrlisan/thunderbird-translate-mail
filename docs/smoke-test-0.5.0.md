# Smoke test — 0.5.0

Install `translate-mail-0.5.0.xpi` via Add-ons and Themes → gear → Install Add-on From File.

## A. DeepL usage (Options)

1. **Shown** → Options with DeepL selected and a working key → a muted line under the key reads `N / 500,000 characters used this month` (numbers match https://www.deepl.com/your-account/usage).
2. **Refreshed** → click **Test** → the line updates (Test costs 5 characters, so it grows by a few).
3. **Other Providers** → switch to Google → the line disappears; back to DeepL → it is back.
4. **Bad key** → break the key, reload Options → no usage line, no error shown (only in the console).

## B. Large-message confirmation

5. **Threshold field** → Options shows `Ask before translating more than this many characters` with 20000. Set it to 500.
6. **Reading side** → open a message longer than 500 characters → Translate → a small window asks `Translate 1,234 characters?` with **Translate** (focused) and **Cancel**; nothing was sent, the button still reads `Translate`. Click **Translate** → window closes, `Translating…`, then translated as usual.
7. **Declined** → another long message → Translate → **Cancel** (or Escape, or close the window) → nothing sent, button `Translate`. Translate again → asks again. While the window is open, click the toolbar button → the window closes (same as Cancel).
8. **Walk away** → long message → Translate (asks) → open a different message, then click **Translate** in the window → nothing happens to either message (the answer belongs to the message you left).
9. **Cached** → go back to the message from step 6 → Translate → instant, no question (cache hit costs nothing).
10. **Selection** → select more than 500 characters → right-click → Translate selection → asks; **Translate** → translates the selection.
11. **Compose** → reply with more than 500 characters → Translate reply → status `Translate 1,234 characters?`, buttons **Translate** and **Cancel**. Cancel → status cleared, Cancel gone. Translate reply again → asks → Translate → translated. A short reply translates without asking.
11b. **Error window** → break the API key → Translate a short message → the error window looks as before (title, text, details, one **Close** button).
12. **Off** → set the threshold to 0 → long message → Translate → no question.
13. Set the threshold back to 20000.

Anything wrong: note the step number and what the header/button showed.
