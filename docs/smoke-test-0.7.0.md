# Smoke test — 0.7.0

Install `translate-mail-0.7.0.xpi` via Add-ons and Themes → gear → Install Add-on From File.

## A. Tone (compose popup, DeepL)

1. **Shown** → DeepL selected in Options → reply to a message → Translate reply → the popup has a **Tone** select under the language, reading `Default`.
2. **Formal** → write `Can you send me the file?` → Tone `Formal`, language German → Translate → the draft reads `Können Sie mir die Datei schicken?` (Sie form). Ctrl+Z restores the English.
3. **Informal** → same text, Tone `Informal` → `Kannst du mir die Datei schicken?` (du form).
4. **Remembered** → close the popup, open it again (or in a new reply) → Tone still reads `Informal`.
5. **Target without formality** → Tone `Formal`, language English or Croatian → translates normally, no error.
6. **Other Providers** → switch Options to Google (or Microsoft) → Translate reply → no Tone select. Back to DeepL → it is back with the last choice.
7. **Localized** → in a `hr` / `de` UI the label and the three choices are translated.

## B. Languages

8. **Options** → the Translate into list now has Bengali, Catalan, Persian, Hindi, Malay (named in the UI language). Pick Catalan, translate a message with DeepL → translated; same with Hindi. (Bengali, Persian and Malay are not in DeepL's list at the time of writing: the Provider's error popup should read as before.)
9. Set the target back.

## C. Everything else unchanged

10. Reading side: Translate / Show original, Translate selection, the large-run question, the error window — all as in 0.6.0.

Anything wrong: note the step number and what the popup/button showed.
