// compose_action popup: one language select, one button. The background does all the work, so closing the
// popup mid-translation cancels nothing — the button reads Cancel until it is done, also when reopened.
// Undo is the editor's own: Ctrl+Z reverts a translation.
import { PROVIDERS } from './providers.js';
import { LANGUAGES } from './languages.js';

const $ = (id) => document.getElementById(id);
const t = (key, subs) => messenger.i18n.getMessage(key, subs);
const names = new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' });
const name = (code) => { try { return names.of(code); } catch { return code; } };
const send = (msg) => messenger.runtime.sendMessage(msg).catch((e) => ({ error: 'errorGeneric', details: e.message }));

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const code of LANGUAGES) $('lang').add(new Option(name(code), code));

let busy = false;

function render(r) {
  busy = !!r.busy;
  $('go').disabled = false;
  $('go').textContent = t(busy ? 'cancel' : r.selection ? 'translateSelection' : 'translate');
  $('status').title = r.details ?? '';
  $('status').textContent =
    r.busy ? t('translating')
    : r.error ? t(r.error, [PROVIDERS[r.provider]?.name ?? '', String(r.status ?? '')])
    : r.alreadyIn ? t('alreadyIn', name(r.alreadyIn))
    : r.from ? t('translatedNote', [name(r.from), name(r.to)])
    : '';
}

const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });

$('go').addEventListener('click', async () => {
  if (busy) { render(await send({ cmd: 'composeCancel', tabId: tab.id })); return; }
  render({ busy: true });
  render(await send({ cmd: 'composeTranslate', tabId: tab.id, lang: $('lang').value }));
});

const state = await send({ cmd: 'composeState', tabId: tab.id });
if (state.suggested) {
  if (!LANGUAGES.includes(state.suggested)) $('lang').add(new Option(name(state.suggested), state.suggested));
  $('lang').value = state.suggested;
}
render(state);
