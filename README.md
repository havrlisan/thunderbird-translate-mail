# Translate Mail

Thunderbird add-on (128+) that adds a **Translate** button to the message header toolbar. One click translates the subject and body of the message you are reading into your language, in place; click again to show the original. Bring your own API key for one of:

| Provider | Where to get credentials | Free tier |
|---|---|---|
| DeepL | https://www.deepl.com/pro-api → API key (free keys end in `:fx`) | 500 000 chars/month |
| Microsoft Translator | Azure portal → Translator resource → Keys and Endpoint (key + region) | 2 000 000 chars/month (F0) |
| Google Cloud Translation | Google Cloud console → enable Cloud Translation API → API key | billed (500 000 chars/month free with billing enabled) |
| Yandex Translate | Yandex Cloud console → service account API key + folder ID | trial grant only |

Message text is sent to the selected Provider **only when you click Translate**. Translations are cached locally (200 most recent) so reopening a message is free.

Not every Provider supports every target language; unsupported combinations show the Provider's error in the button tooltip.

## Install for development

Thunderbird → Tools → Add-ons and Themes → gear icon → **Debug Add-ons** → **Load Temporary Add-on** → choose `manifest.json`. Then open the add-on's Preferences, pick a Provider, paste the key, choose the target language.

## Tests

```
npm test
```

## Package

From PowerShell in the repo root:

```
Compress-Archive -Force -Path manifest.json,_locales,icons,src -DestinationPath translate-mail.zip
```

Rename to `.xpi` or upload the `.zip` to addons.thunderbird.net.
