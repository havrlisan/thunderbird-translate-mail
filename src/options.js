import { PROVIDERS, translateAll, errorKey } from './providers.js';
import { LANGUAGES } from './languages.js';

const $ = (id) => document.getElementById(id);
const t = (key, subs) => messenger.i18n.getMessage(key, subs);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

const names = new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' });
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').add(new Option(p.name, id));
for (const code of LANGUAGES) $('target').add(new Option(names.of(code), code));

let creds = {};

function save() {
  return messenger.storage.local.set({
    provider: $('provider').value, target: $('target').value, translateQuoted: $('quoted').checked,
    warnChars: Math.max(0, parseInt($('warn').value, 10) || 0), creds,
  });
}

// "312,400 / 500,000 characters used this month" for Providers that report it (DeepL). Refreshed on load and
// after a successful Test; quietly blank when the key is missing or the request fails.
async function showUsage() {
  const id = $('provider').value;
  const p = PROVIDERS[id];
  const c = creds[id] ?? {};
  $('usage').textContent = '';
  if (!p.usage || p.fields.some((f) => !c[f])) return;
  try {
    const { count, limit } = await p.usage(c, fetch);
    if ($('provider').value === id) $('usage').textContent = t('usage', [count.toLocaleString(), limit.toLocaleString()]);
  } catch (e) {
    console.error(e);
  }
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
  }), Object.assign(document.createElement('a'), { href: PROVIDERS[id].help, target: '_blank', textContent: t('getKey', PROVIDERS[id].name) }));
}

$('provider').addEventListener('change', () => { renderFields(); save(); showUsage(); });
$('target').addEventListener('change', save);
$('quoted').addEventListener('change', save);
$('warn').addEventListener('change', save);
// One billable "Hello" against the current credentials, so a wrong key is caught here rather than on the first click.
$('test').addEventListener('click', async () => {
  const id = $('provider').value;
  const c = creds[id] ?? {};
  const status = $('testStatus');
  status.title = '';
  if (PROVIDERS[id].fields.some((f) => !c[f])) { status.textContent = t('testMissing'); return; }
  $('test').disabled = true;
  status.textContent = t('testing');
  try {
    const r = await translateAll(id, ['Hello'], $('target').value, c);
    status.textContent = t('testOk', r.texts[0]);
    showUsage();
  } catch (e) {
    status.textContent = t(errorKey(e, id), [PROVIDERS[id].name, String(e.status ?? '')]);
    status.title = e.message;
  } finally {
    $('test').disabled = false;
  }
});
$('clearCache').addEventListener('click', async () => {
  await messenger.storage.local.remove('cache');
  $('status').textContent = t('cacheCleared');
});

const s = await messenger.storage.local.get({ provider: 'deepl', target: 'en', translateQuoted: false, warnChars: 20000, creds: {} });
creds = s.creds;
$('provider').value = PROVIDERS[s.provider] ? s.provider : 'deepl';
$('target').value = s.target;
$('quoted').checked = s.translateQuoted;
$('warn').value = s.warnChars;
renderFields();
showUsage();
