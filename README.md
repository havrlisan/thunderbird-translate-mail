# Translate Mail

Thunderbird add-on (128+) that adds a **Translate** button to the message header toolbar and a **Translate reply** button to the compose toolbar. One click translates the subject and body of the message you are reading into your language, in place; click again to show the original. Bring your own API key for one of:

| Provider | Where to get credentials | Free tier |
|---|---|---|
| DeepL | https://www.deepl.com/pro-api → API key (free keys end in `:fx`) | 500 000 chars/month |
| Microsoft Translator | Azure portal → Translator resource → Keys and Endpoint (key + region) | 2 000 000 chars/month (F0) |
| Google Cloud Translation | Google Cloud console → enable Cloud Translation API → API key | billed (500 000 chars/month free with billing enabled) |
| Yandex Translate | Yandex Cloud console → service account API key + folder ID | trial grant only |

The button is also bound to **Ctrl+Shift+X** (change it under Add-ons and Themes → gear → Manage Extension Shortcuts). To translate only part of a message, select it and pick **Translate selection** from the right-click menu: that part is replaced in place (quoted text included), the button reads Show original, and the next Translate click does the whole message again.

In a compose window, the **Translate reply** button translates what you wrote into the language of the message you are answering (preselected when you translated that message; pick any language otherwise). Select some text first to translate only that. Your reply is sent with its own formatting (as HTML), so bold text and links stay where they are and sentences are translated whole. Quoted text and your signature are left alone unless you selected them. Bare links and e-mail addresses on their own are skipped. The subject is not touched, and the translation is written through the editor, so **Ctrl+Z** undoes it and Ctrl+Y brings it back. The button is bound to **Ctrl+Shift+E**.

Message text is sent to the selected Provider **only when you click Translate**. Translations are cached locally (200 most recent) so reopening a message is free.

Quoted replies, signatures and forwarded-message headers are skipped by default — they have already been read and would eat into free-tier quota. Turn on **Also translate quoted text and signatures** in the add-on settings to include them.

Hard-wrapped lines in plain-text messages are joined before translation so sentences are not translated as fragments; lines shorter than 40 characters, indented lines and list items are left alone, so a long address or table line can occasionally be merged with the next one in the translated view (the original is never modified).

Not every Provider supports every target language; unsupported combinations show the Provider's error in a popup window.

## Install

Install from [addons.thunderbird.net](https://addons.thunderbird.net/thunderbird/addon/translate-mail/).

## Install for development

Thunderbird → Tools → Add-ons and Themes → gear icon → **Debug Add-ons** → **Load Temporary Add-on** → choose `manifest.json`. Then open the add-on's Preferences, pick a Provider, paste the key, choose the target language.

## Tests

```
npm test
```

## Package

```
python scripts/package.py
```

Writes `translate-mail-<version>.xpi` in the repo root (PowerShell's `Compress-Archive` is avoided on purpose: it writes backslash entry names, which Thunderbird rejects). Upload the `.xpi` to addons.thunderbird.net, or install it locally via Add-ons and Themes → gear → Install Add-on From File.
