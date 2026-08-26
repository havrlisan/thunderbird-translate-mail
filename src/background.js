import { PROVIDERS, translateAll, errorKey } from './providers.js';
import { cacheKey, cachePut, cachedDetected } from './cache.js';

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

// Bumped whenever a tab shows a different message (or goes away): a click still in flight for the
// previous message must not touch the button or the new document.
const generation = new Map();
const bump = (tabId) => generation.set(tabId, (generation.get(tabId) ?? 0) + 1);

// label = button text, title = tooltip.
async function setButton(tabId, label, title = label) {
  await messenger.messageDisplayAction.setLabel({ tabId, label });
  await messenger.messageDisplayAction.setTitle({ tabId, title });
}

function showOriginalButton(tabId, from) {
  return setButton(tabId, t('showOriginal'), t('translatedFrom', languageName(from)));
}

// Everything both click paths need. `creds` is narrowed to the selected Provider; `configured` is false when
// no Provider is chosen or a credential field is empty.
async function loadSettings() {
  const { provider, target = 'en', creds = {}, cache = {}, translateQuoted = false, replyLang } =
    await messenger.storage.local.get(['provider', 'target', 'creds', 'cache', 'translateQuoted', 'replyLang']);
  const c = creds[provider] ?? {};
  const p = PROVIDERS[provider];
  return { provider, target, creds: c, cache, translateQuoted, replyLang, configured: !!p && p.fields.every((f) => c[f]) };
}

// Idempotent: content.js guards against running twice in the same document.
const inject = (tabId) => messenger.scripting.executeScript({ target: { tabId }, files: ['src/text.js', 'src/content.js'] });

// A newly displayed message is a fresh document: the content script state is gone, reset the button too.
messenger.messageDisplay.onMessagesDisplayed.addListener((tab) => {
  bump(tab.id);
  detectedByTab.delete(tab.id);
  setButton(tab.id, t('translate')).catch(console.error);
});

messenger.tabs.onRemoved.addListener(bump);

// Explain a failed translation in a small popup window; the button itself stays "Translate".
async function showError(e, provider) {
  const name = PROVIDERS[provider]?.name ?? String(provider);
  const params = new URLSearchParams({ title: t('error'), text: t(errorKey(e, provider), [name, String(e.status ?? '')]), details: e.message });
  await messenger.windows.create({
    url: `${messenger.runtime.getURL('src/error.html')}?${params}`,
    type: 'popup', width: 480, height: 240, allowScriptsToClose: true,
  });
}

messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  if (inFlight.has(tabId)) return;
  inFlight.add(tabId);
  const gen = generation.get(tabId);
  const stale = () => generation.get(tabId) !== gen;
  let provider;
  try {
    let target, c, cache, translateQuoted, configured;
    ({ provider, target, creds: c, cache, translateQuoted, configured } = await loadSettings());
    if (!configured) {
      await messenger.runtime.openOptionsPage();
      return;
    }

    // The content script reuses its last Translation only if it was made with the same settings.
    const settingsKey = `${provider}|${target}|${translateQuoted}`;
    await inject(tabId);
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: !translateQuoted, settingsKey });
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
    if (stale()) return; // user moved on meanwhile; the Translation is cached for when they come back

    detectedByTab.set(tabId, hit.detected);
    if (hit.detected === target) {
      await setButton(tabId, t('alreadyIn', languageName(target)));
      return;
    }
    const note = t('translatedNote', [languageName(hit.detected), languageName(target)]);
    await messenger.tabs.sendMessage(tabId, { cmd: 'apply', subject: hit.subject, texts: hit.texts, note, settingsKey });
    await showOriginalButton(tabId, hit.detected);
  } catch (e) {
    console.error(e);
    if (stale()) return;
    await setButton(tabId, t('translate'));
    await showError(e, provider);
  } finally {
    inFlight.delete(tabId);
  }
});

// --- Compose side: the popup (src/compose.js) drives these over runtime.sendMessage. ---

// Language to suggest for a reply: what the reading side detected on the message being answered,
// else the last language used here, else the Target Language.
async function suggestedLanguage(tabId, { cache, replyLang, target }) {
  try {
    const { relatedMessageId } = await messenger.compose.getComposeDetails(tabId);
    if (relatedMessageId) {
      const { headerMessageId } = await messenger.messages.get(relatedMessageId);
      const detected = cachedDetected(cache, headerMessageId);
      if (detected) return detected;
    }
  } catch (e) {
    console.error(e); // no related message (new mail, reopened draft) or it is gone; fall through
  }
  return replyLang ?? target;
}

async function composeState(tabId) {
  await inject(tabId);
  const { shown } = await messenger.tabs.sendMessage(tabId, { cmd: 'state' });
  return { shown, suggested: await suggestedLanguage(tabId, await loadSettings()), busy: inFlight.has(tabId) };
}

// Translate the draft (quoted text and signature excluded) into `lang`, or restore the Original if a Translation
// is shown. No cache: drafts change. Errors are returned, not thrown — the popup renders them.
async function composeTranslate(tabId, lang) {
  if (inFlight.has(tabId)) return { busy: true };
  inFlight.add(tabId);
  let provider;
  try {
    const s = await loadSettings();
    provider = s.provider;
    if (!s.configured) {
      await messenger.runtime.openOptionsPage();
      return { error: 'setupFirst' };
    }
    await inject(tabId);
    const settingsKey = `${provider}|${lang}`;
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: true, settingsKey });
    if (!state.texts) return { shown: false }; // restored the Original
    if (state.texts.length === 0) return { error: 'nothingToTranslate' };
    const r = await translateAll(provider, state.texts, lang, s.creds);
    if (r.detected === lang) return { alreadyIn: lang };
    await messenger.tabs.sendMessage(tabId, { cmd: 'apply', subject: '', texts: r.texts, note: '', settingsKey });
    await messenger.storage.local.set({ replyLang: lang });
    return { shown: true, from: r.detected, to: lang };
  } catch (e) {
    console.error(e);
    return { error: errorKey(e, provider), details: e.message, provider, status: e.status };
  } finally {
    inFlight.delete(tabId);
  }
}

messenger.runtime.onMessage.addListener((msg) => {
  if (msg.cmd === 'composeState') return composeState(msg.tabId);
  if (msg.cmd === 'composeTranslate') return composeTranslate(msg.tabId, msg.lang);
  return undefined;
});
