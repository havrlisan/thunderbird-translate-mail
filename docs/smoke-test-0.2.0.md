# Smoke test — 0.2.0

Install `translate-mail-0.2.0.xpi` via Add-ons and Themes → gear → Install Add-on From File (not Load Temporary Add-on: it does not exercise the packaged build). Open the add-on's Preferences once so the existing key/target are still there.

## A. Options page

1. **Test button, good key** → click Test → `Testing…` then `✓ Works (Hello → <word in your target language>)`. With target = English the word is `Hello`.
2. **Test button, bad key** → change one character of the API key, Test → `DeepL rejected the request (HTTP 403)…` (401/403 depending on Provider). Hover the text: tooltip shows the raw `HTTP 403: …` body. Restore the key.
3. **Test button, empty field** → clear the key, Test → `Enter the credentials first`, no request made. Restore the key.
4. **Test button, offline** (optional) → disable network, Test → `Could not reach DeepL…`.
5. **Quoted-text checkbox** → tick it, close and reopen Preferences → still ticked. Untick.

## B. Quoted text / signatures (option off = default)

Use a thread with at least one reply, ideally one you sent from Thunderbird (so it has `.moz-cite-prefix` / `.moz-signature`).

6. **HTML reply** → Translate → the new text is translated; the `On … wrote:` line, the quoted block below it and your signature stay in the original language. Click again → original restored exactly.
7. **Plain-text reply** → same on a plain-text message (View → Message Body As → Plain Text if you have none): quoted `>` lines and everything after `-- ` untouched.
8. **Gmail reply** (if you have one) → the `gmail_quote` block stays untouched.
9. **Inline forward** (Forward → Inline) → the `-------- Forwarded Message --------` header table stays untouched, the forwarded body IS translated.
10. **Option on** → tick "Also translate quoted text and signatures", Translate the message from step 6 again → now everything is translated. Note: the button label may still show `Show original` if you did not switch messages; select another message and come back first.

## C. Hard-wrapped plain text

11. Find (or send yourself from another client, e.g. Outlook/Gmail plain-text mode, or `format=flowed` off) a plain-text message whose paragraphs are hard-wrapped at ~72 columns. Translate → sentences read as whole sentences, not one fragment per line; paragraph breaks preserved; list items (`- `, `1. `) stay on their own lines. Show original → identical to before.
12. A message from Thunderbird itself (format=flowed) should look exactly as in 0.1.1.

## D. Shortcut

13. Message selected, focus in the message list → **Alt+Shift+T** → translates; again → original. Check Add-ons and Themes → gear → Manage Extension Shortcuts lists "Translate Mail: Translate" with Alt+Shift+T.

## E. Regression

14. Cache: translate a message, switch away and back, Translate → instant (no `Translating…` flash).
15. Message already in the target language → button shows `Already in <language>`.
16. Dark theme: Options page and the error popup still readable.

Anything wrong: note the step number and what the header/button showed.

## F. Fixes after the first round (0.2.0 build 2)

17. Options: the checkbox sits left of its label on one line, same text colour as the buttons.
18. Translate a message, click Show original, change **Translate into** in Preferences, click Translate on the same message → `Translating…`, new language. Same after ticking **Also translate quoted text and signatures**.
19. Shortcut is now **Ctrl+Shift+X**.
20. Click Translate and immediately select another message: the new message's button stays `Translate`, no error popup. Go back to the first message and click Translate → instant (came from cache).
21. Click Translate on a message opened in its own tab and close the tab before it finishes → no error popup.
