# Smoke test — 0.5.0

Install `translate-mail-0.5.0.xpi` via Add-ons and Themes → gear → Install Add-on From File.

## A. DeepL usage (Options)

1. **Shown** → Options with DeepL selected and a working key → a muted line under the key reads `N / 500,000 characters used this month` (numbers match https://www.deepl.com/your-account/usage).
2. **Refreshed** → click **Test** → the line updates (Test costs 5 characters, so it grows by a few).
3. **Other Providers** → switch to Google → the line disappears; back to DeepL → it is back.
4. **Bad key** → break the key, reload Options → no usage line, no error shown (only in the console).

## B. Large-message confirmation

5. **Threshold field** → Options shows `Ask before translating more than this many characters` with 20000. Set it to 500.
6. **Reading side** → open a message longer than 500 characters → Translate → button reads `Translate 1,234 characters? Click again`, nothing was sent. Click again → `Translating…`, then translated as usual.
7. **Double-click** → another long message → double-click the button fast → it only asks (the second click lands on the disabled button); one more click → translates.
8. **Walk away** → long message → Translate (asks) → open a different message → Translate → asks again (the pending confirmation did not carry over).
9. **Cached** → go back to the message from step 6 → Translate → instant, no question (cache hit costs nothing).
10. **Selection** → select more than 500 characters → right-click → Translate selection → asks; repeat the menu entry → translates.
11. **Compose** → reply with more than 500 characters → Translate reply → status `Translate 1,234 characters? Click again`, button briefly disabled; click again → translated. A short reply translates without asking.
12. **Off** → set the threshold to 0 → long message → Translate → no question.
13. Set the threshold back to 20000.

Anything wrong: note the step number and what the header/button showed.
