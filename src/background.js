import { PROVIDERS, translateAll } from './providers.js';
import { cacheKey, cachePut } from './cache.js';

const t = (key, subs) => messenger.i18n.getMessage(key, subs);

function languageName(code) {
  try {
    return new Intl.DisplayNames([messenger.i18n.getUILanguage()], { type: 'language' }).of(code);
  } catch {
    return code;
  }
}

// Detected Source Language per tab, so toggling back and forth keeps the tooltip.
const detectedByTab = new Map();

// Tabs with a click already being handled; a second click would race the first.
const inFlight = new Set();

// label = button text, title = tooltip.
async function setButton(tabId, label, title = label) {
  await messenger.messageDisplayAction.setLabel({ tabId, label });
  await messenger.messageDisplayAction.setTitle({ tabId, title });
}

function showOriginalButton(tabId, from) {
  return setButton(tabId, t('showOriginal'), t('translatedFrom', languageName(from)));
}

// A newly displayed message is a fresh document: the content script state is gone, reset the button too.
messenger.messageDisplay.onMessagesDisplayed.addListener((tab) => {
  detectedByTab.delete(tab.id);
  setButton(tab.id, t('translate')).catch(console.error);
});

// Explain a failed translation in a small popup window; the button itself stays "Translate".
async function showError(e, provider) {
  const name = PROVIDERS[provider]?.name ?? String(provider);
  const status = e.status;
  const key =
    status === 401 || status === 403 ? (provider === 'microsoft' ? 'errorAuthMicrosoft' : 'errorAuth')
    : status === 429 || status === 456 ? 'errorQuota' // 456 = DeepL quota exceeded
    : status ? 'errorHttp'
    : e.network ? 'errorNetwork'
    : 'errorGeneric';
  const params = new URLSearchParams({ title: t('error'), text: t(key, [name, String(status ?? '')]), details: e.message });
  await messenger.windows.create({
    url: `${messenger.runtime.getURL('src/error.html')}?${params}`,
    type: 'popup', width: 480, height: 240, allowScriptsToClose: true,
  });
}

messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  if (inFlight.has(tabId)) return;
  inFlight.add(tabId);
  let provider;
  try {
    let target, creds, cache, translateQuoted;
    ({ provider, target = 'en', creds = {}, cache = {}, translateQuoted = false } =
      await messenger.storage.local.get(['provider', 'target', 'creds', 'cache', 'translateQuoted']));
    const p = PROVIDERS[provider];
    const c = creds[provider] ?? {};
    if (!p || p.fields.some((f) => !c[f])) {
      await messenger.runtime.openOptionsPage();
      return;
    }

    await messenger.scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] });
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: !translateQuoted });
    if (!state.texts) {
      // Toggled an existing Translation on or off.
      if (state.shown) await showOriginalButton(tabId, detectedByTab.get(tabId) ?? '');
      else await setButton(tabId, t('translate'));
      return;
    }

    const [msg] = (await messenger.messageDisplay.getDisplayedMessages(tabId)).messages;
    const subject = (msg.subject ?? '').trim();
    if (!subject && state.texts.length === 0) {
      await setButton(tabId, t('nothingToTranslate'));
      return;
    }

    const key = cacheKey(msg.headerMessageId, provider, target);
    let hit = cache[key];
    if (hit && hit.texts.length !== state.texts.length) hit = undefined; // body renders differently now (e.g. plain text vs HTML)
    if (!hit) {
      await setButton(tabId, t('translating'));
      const input = subject ? [subject, ...state.texts] : state.texts;
      const r = await translateAll(provider, input, target, c);
      hit = subject
        ? { subject: r.texts[0], texts: r.texts.slice(1), detected: r.detected }
        : { subject: '', texts: r.texts, detected: r.detected };
      // ponytail: read-modify-write of the whole cache; concurrent clicks in two tabs can drop one entry. Fine for a cache.
      await messenger.storage.local.set({ cache: cachePut(cache, key, hit, Date.now()) });
    }

    detectedByTab.set(tabId, hit.detected);
    if (hit.detected === target) {
      await setButton(tabId, t('alreadyIn', languageName(target)));
      return;
    }
    const note = t('translatedNote', [languageName(hit.detected), languageName(target)]);
    await messenger.tabs.sendMessage(tabId, { cmd: 'apply', subject: hit.subject, texts: hit.texts, note });
    await showOriginalButton(tabId, hit.detected);
  } catch (e) {
    console.error(e);
    await setButton(tabId, t('translate'));
    await showError(e, provider);
  } finally {
    inFlight.delete(tabId);
  }
});
