import { PROVIDERS } from './providers.js';
import { LANGUAGES } from './languages.js';

const $ = (id) => document.getElementById(id);
const t = (key) => messenger.i18n.getMessage(key);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

const names = new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' });
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').add(new Option(p.name, id));
for (const code of LANGUAGES) $('target').add(new Option(names.of(code), code));

let creds = {};

function save() {
  return messenger.storage.local.set({ provider: $('provider').value, target: $('target').value, creds });
}

// One input per credential field of the selected Provider; other Providers' credentials are kept.
function renderFields() {
  const id = $('provider').value;
  $('fields').replaceChildren(...PROVIDERS[id].fields.map((field) => {
    const label = document.createElement('label');
    label.append(Object.assign(document.createElement('span'), { textContent: t(`field_${field}`) }));
    const input = Object.assign(document.createElement('input'), {
      type: field === 'apiKey' ? 'password' : 'text',
      value: creds[id]?.[field] ?? '',
    });
    input.addEventListener('input', () => {
      (creds[id] ??= {})[field] = input.value.trim();
      save();
    });
    label.append(input);
    return label;
  }));
}

$('provider').addEventListener('change', () => { renderFields(); save(); });
$('target').addEventListener('change', save);
$('clearCache').addEventListener('click', async () => {
  await messenger.storage.local.remove('cache');
  $('status').textContent = t('cacheCleared');
});

const s = await messenger.storage.local.get({ provider: 'deepl', target: 'en', creds: {} });
creds = s.creds;
$('provider').value = s.provider;
$('target').value = s.target;
renderFields();
