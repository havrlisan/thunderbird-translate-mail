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
let confirmed = false; // the last answer was "Translate N characters? Click again"

function render(r) {
  busy = !!r.busy;
  confirmed = !!r.confirm;
  // A big run needs a second click; lock the button briefly so a fast double-click cannot confirm by accident.
  $('go').disabled = confirmed;
  if (confirmed) setTimeout(() => { $('go').disabled = false; }, 500);
  $('go').textContent = t(busy ? 'cancel' : r.selection ? 'translateSelection' : 'translate');
  $('hint').hidden = !!r.selection;
  $('status').title = r.details ?? '';
  $('status').textContent =
    r.busy ? t('translating')
    : r.confirm ? t('confirmChars', r.confirm.toLocaleString())
    : r.error ? t(r.error, [PROVIDERS[r.provider]?.name ?? '', String(r.status ?? '')])
    : r.alreadyIn ? t('alreadyIn', name(r.alreadyIn))
    : r.from ? t('translatedNote', [name(r.from), name(r.to)])
    : '';
}

const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });

$('go').addEventListener('click', async () => {
  if (busy) { render(await send({ cmd: 'composeCancel', tabId: tab.id })); return; }
  const msg = { cmd: 'composeTranslate', tabId: tab.id, lang: $('lang').value, confirmed };
  render({ busy: true });
  render(await send(msg));
});

const state = await send({ cmd: 'composeState', tabId: tab.id });
if (state.suggested) {
  if (!LANGUAGES.includes(state.suggested)) $('lang').add(new Option(name(state.suggested), state.suggested));
  $('lang').value = state.suggested;
}
render(state);
