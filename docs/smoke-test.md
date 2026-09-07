# Smoke test

Run against the packaged build: Add-ons and Themes → gear → **Install Add-on From File** → `translate-mail-<version>.xpi` (Load Temporary Add-on does not exercise the packaged build, and toolbar icons render differently). Open the add-on's Preferences once so the existing key/target are still there. Anything wrong: note the step number and what the header/button/popup showed.

## A. Options

1. **Test, good key** → `Testing…` then `✓ Works (Hello → <word in your target language>)`; with target = English the word is `Hello`.
2. **Test, bad key** → change one character of the key → `DeepL rejected the request (HTTP 403)…` (401/403 by Provider); hovering shows the raw response. Restore the key.
3. **Test, empty field** → clear the key → `Enter the credentials first`, no request. Restore the key.
4. **Test, offline** (optional) → `Could not reach DeepL…`.
5. **Settings persist** → tick the quoted-text checkbox, set the character threshold to 500, close and reopen Preferences → still there. Untick the checkbox, keep 500 for section E.
6. **DeepL usage** → with DeepL and a working key a muted line reads `N / 500,000 characters used this month` (matches https://www.deepl.com/your-account/usage); Test refreshes it; Google selected → line gone; bad key → no line, no error.
7. **No Provider configured** → clear the key → Translate on a message → Options page opens. Restore the key.
8. **Languages** → the Translate into list includes Bengali, Catalan, Persian, Hindi, Malay, named in the UI language. Catalan and Hindi translate with DeepL; a language the Provider lacks shows its error popup.
9. **Dark theme** → Options page, error window and compose popup readable.

## B. Reading side

10. **Toggle** → HTML message → Translate → subject and body translated in place with a `Subject:` + `Translated: X → Y` block on top; button reads `Show original`, tooltip `Translated from X`. Click again → original restored exactly. Same on a plain-text message.
11. **Cache** → switch away and back → Translate → instant, no `Translating…` flash.
12. **Already in** → message in the Target Language → `Already in <language>`.
13. **Settings change** → Translate, Show original, change **Translate into** → Translate the same message → `Translating…`, new language. Same after ticking the quoted-text option.
14. **Cancel** → long message → Translate → while `Translating…` (tooltip `click to cancel`) click again → back to `Translate`, no error, message untouched; Translate again works.
15. **Walk away** → Translate and immediately select another message → the new message's button stays `Translate`, no popup; back to the first → instant from cache. Same when closing a message's own tab mid-flight.
16. **Shortcut** → focus in the message list → **Ctrl+Shift+X** toggles; Manage Extension Shortcuts lists it.
17. **Error window** → break the key → Translate → small window with title, text, details and one **Close** button; button back to `Translate`. Fix the key.

## C. Quoted text and signatures

Use a thread with a reply you sent from Thunderbird (`.moz-cite-prefix` / `.moz-signature`).

18. **HTML reply, option off** → new text translated; the `On … wrote:` line, the quoted block and your signature stay original.
19. **Plain-text reply** → `>` lines and everything after `-- ` untouched.
20. **Gmail reply** (if you have one) → the `gmail_quote` block untouched.
21. **Inline forward** → the `-------- Forwarded Message --------` header table untouched, forwarded body translated.
22. **Option on** → tick it, select another message and come back, Translate step 18's message → everything translated. Untick.
23. **Hard-wrapped plain text** (~72 columns, e.g. from Outlook or Gmail plain-text mode) → sentences read whole, paragraph breaks kept, `- ` / `1. ` items on their own lines; Show original identical to before. Thunderbird's own format=flowed mail unchanged.

## D. Translate selection (reading side)

24. **Basic** → select a sentence starting and ending mid-paragraph → right-click → **Translate selection** → only that part replaced, no header block, button `Show original`.
25. **Show original** → sentence back, button `Translate`; click again → the *whole* message translates with the header block.
26. **Over a shown Translation** → nothing changes, button still `Show original`.
27. **Second selection** → the first reverts, the second is translated.
28. **Quoted text** → selection inside a quote translates even with the option off.
29. **Cancel** → long selection → click the button while `Translating…` → untouched, no error.
30. **Already in / nothing** → text in the Target Language → `Already in <language>`; only a URL → `Nothing to translate`.
31. **Plain-text message** → only the selected words change, the rest of the same paragraph stays.
32. **Not cached** → after a selection translate, another message and back → Translate → `Translating…` (full, fresh).

## E. Large-run confirmation (threshold 500 from step 5)

33. **Reading side** → message over 500 characters → Translate → window `Translate 1,234 characters?` with **Translate** (focused) and **Cancel**; nothing sent yet. Translate → closes, `Translating…`, translated.
34. **Declined** → Cancel / Escape / close → nothing sent, button `Translate`; asks again next time. Clicking the toolbar button while the window is open closes it.
35. **Walk away** → question open → open another message → click Translate in the window → nothing happens to either message.
36. **Cached** → back to step 33's message → instant, no question.
37. **Selection** → over 500 characters selected → asks → Translate → done.
38. **Compose** → reply over 500 characters → Translate reply → status `Translate 1,234 characters?`, **Translate** / **Cancel**; Cancel clears; Translate translates. Short reply: no question.
39. **Off** → threshold 0 → no question. Set it back to 20000.

## F. Compose side

40. **Reply, known language** → translate a foreign message, Reply → **Translate reply** → popup preselects that Source Language → Translate → your text translated in place; quote, `On … wrote:`, signature, bold and links untouched; status `Translated: X → Y`.
41. **Undo / redo** → Ctrl+Z reverts in one step; Ctrl+Y re-applies.
42. **Selection** → gray tip shown when nothing is selected; select part of a sentence → button `Translate selection`, tip gone → only that part translated (inside a quote too). Right-click → Translate selection in the editor opens the same popup.
43. **New message** → language preselected to the last one used.
44. **Already in / empty** → draft in the picked language → `Already in <language>`; empty draft → `Nothing to translate`.
45. **Bad key / no Provider** → Provider error in the popup with the raw response in its tooltip; with no key the Options page opens and the popup says `Set up a Provider in the add-on settings first`.
46. **Plain-text compose** → steps 40–42; `>` lines untouched.
47. **Popup closed mid-flight** → close at once, reopen → `Translating…`, button `Cancel`; the translation lands anyway. Cancel from the reopened popup → draft untouched, Translate again works.
48. **Send** → send a translated reply to yourself, HTML and plain text → received body is the translation, quoted part original.
49. **Fragments** → `Hello,` / `this is an example message.` / `Link: https://github.com/havrlisan` / `This is a <b>bold</b> part of the text.` → comma and period kept, *bold* agrees with its sentence and stays bold, the link stays a link.
50. **Edited mid-flight** → reply text above and below the quote, Translate, type into the lower block while `Translating…` → generic error, *nothing* written.
51. **Selection, then click away** → collapse the selection while `Translating…` → the selection is still translated.
52. **Long reply** → ~12 000 characters → translated; one Ctrl+Z reverts.
53. **Formatted paste** → paste a few paragraphs of a plain-text message from the reading pane into an HTML draft → translated, still monospace with the same breaks and links.
54. **Shortcut** → **Ctrl+Shift+E** opens the popup in a compose window; does nothing in the main window.

## G. Tone (DeepL only)

55. **Shown** → DeepL selected → Translate reply popup has **Tone** under the language, reading `Default`.
56. **Formal** → `Can you send me the file?` → Tone `Formal`, German → `Können Sie mir die Datei schicken?`; Ctrl+Z restores.
57. **Informal** → Tone `Informal` → `Kannst du mir die Datei schicken?`.
58. **Remembered** → reopen the popup (or a new reply) → still `Informal`.
59. **Target without formality** → Tone `Formal`, English or Croatian → translates normally, no error.
60. **Other Providers** → Google or Microsoft selected → no Tone select; back to DeepL → back with the last choice.

## H. Localization

61. Thunderbird in `hr` / `de` / `fr` / `es` / `it` → button labels, popup, Options, error and confirmation windows, Tone choices all translated; placeholders (`Translate 1,234 characters?`, `Already in Deutsch`) filled.
