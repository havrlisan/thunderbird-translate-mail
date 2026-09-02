import { PROVIDERS, translateAll, errorKey, LIMITS } from './providers.js';
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

// Tabs with a translation in flight, by AbortController: a second click (or the popup's Cancel) aborts it.
const inFlight = new Map();
const abortable = (signal) => (url, init) => fetch(url, { ...init, signal });

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

// Button click: toggle the whole message's Translation (cached per message). Menu click (`selection`): translate
// the text nodes under the selection in place, uncached, no subject or header; the button then reads Show original.
async function translateTab(tabId, selection = false) {
  if (inFlight.has(tabId)) { inFlight.get(tabId).abort(); return; }
  const ctl = new AbortController();
  inFlight.set(tabId, ctl);
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
    const state = await messenger.tabs.sendMessage(tabId, { cmd: 'toggle', skipQuoted: !translateQuoted, settingsKey, selection });
    if (!state.texts) {
      // Toggled an existing Translation on or off.
      if (state.shown) await showOriginalButton(tabId, detectedByTab.get(tabId) ?? '');
      else await setButton(tabId, t('translate'));
      return;
    }

    const [msg] = (await messenger.messageDisplay.getDisplayedMessages(tabId)).messages;
    const subject = selection ? '' : (msg.subject ?? '').trim();
    if (!subject && state.texts.length === 0) {
      await setButton(tabId, t('nothingToTranslate'));
      return;
    }

    const key = cacheKey(msg.headerMessageId, provider, target);
    let hit = selection ? undefined : cache[key];
    if (hit && hit.texts.length !== state.texts.length) hit = undefined; // body renders differently now (e.g. plain text vs HTML)
    if (!hit) {
      await setButton(tabId, t('translating'), t('clickToCancel'));
      const input = subject ? [subject, ...state.texts] : state.texts;
      const r = await translateAll(provider, input, target, c, abortable(ctl.signal));
      hit = subject
        ? { subject: r.texts[0], texts: r.texts.slice(1), detected: r.detected }
        : { subject: '', texts: r.texts, detected: r.detected };
      // ponytail: read-modify-write of the whole cache; concurrent clicks in two tabs can drop one entry. Fine for a cache.
      if (!selection) await messenger.storage.local.set({ cache: cachePut(cache, key, hit, Date.now()) });
    }
    if (stale()) return; // user moved on meanwhile; the Translation is cached for when they come back

    detectedByTab.set(tabId, hit.detected);
    if (hit.detected === target) {
      await setButton(tabId, t('alreadyIn', languageName(target)));
      return;
    }
    const note = selection ? '' : t('translatedNote', [languageName(hit.detected), languageName(target)]);
    // A selection Translation carries no settingsKey: the next Translate click must do the whole message, not re-show it.
    await messenger.tabs.sendMessage(tabId, { cmd: 'apply', subject: hit.subject, texts: hit.texts, note, settingsKey: selection ? null : settingsKey });
    await showOriginalButton(tabId, hit.detected);
  } catch (e) {
    const cancelled = e.name === 'AbortError';
    if (!cancelled) console.error(e);
    if (stale()) return;
    await setButton(tabId, t('translate'));
    if (!cancelled) await showError(e, provider);
  } finally {
    inFlight.delete(tabId);
  }
}

messenger.messageDisplayAction.onClicked.addListener((tab) => translateTab(tab.id));

// "Translate selection" in the context menu of selected text. Thunderbird shows a `selection` item wherever text is
// selected, the compose editor included: there it opens the Translate reply popup, which handles selections itself.
messenger.menus.create({ id: 'translate-selection', title: t('translateSelection'), contexts: ['selection'] }, () => void messenger.runtime.lastError);
messenger.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'translate-selection') return;
  if (tab.type === 'messageCompose') messenger.composeAction.openPopup({ windowId: tab.windowId }).catch(console.error);
  else translateTab(tab.id, true).catch(console.error);
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
  const busy = inFlight.has(tabId);
  let selection = false;
  if (!busy) {
    await inject(tabId);
    ({ selection } = await messenger.tabs.sendMessage(tabId, { cmd: 'composeCollect', max: LIMITS.maxChars }));
  }
  return { selection, suggested: await suggestedLanguage(tabId, await loadSettings()), busy };
}

// Translate the selection, or the whole draft with quoted text and signature excluded, into `lang`. Each run
// goes as HTML so sentences keep their inline formatting and their context. The content script writes through
// the editor, so Ctrl+Z reverts it. No cache: drafts change. Errors are returned, not thrown — the popup renders them.
async function composeTranslate(tabId, lang) {
  if (inFlight.has(tabId)) return { busy: true };
  const ctl = new AbortController();
  inFlight.set(tabId, ctl);
  let provider;
  try {
    const s = await loadSettings();
    provider = s.provider;
    if (!s.configured) {
      await messenger.runtime.openOptionsPage();
      return { error: 'setupFirst' };
    }
    await inject(tabId);
    const { texts } = await messenger.tabs.sendMessage(tabId, { cmd: 'composeCollect', max: LIMITS.maxChars });
    if (texts.length === 0) return { error: 'nothingToTranslate' };
    const r = await translateAll(provider, texts, lang, s.creds, abortable(ctl.signal), { html: true });
    if (r.detected === lang) return { alreadyIn: lang };
    const { inserted } = await messenger.tabs.sendMessage(tabId, { cmd: 'composeInsert', texts: r.texts });
    if (!inserted) return { error: 'errorGeneric', provider };
    await messenger.storage.local.set({ replyLang: lang });
    return { from: r.detected, to: lang };
  } catch (e) {
    if (e.name === 'AbortError') return { cancelled: true };
    console.error(e);
    return { error: errorKey(e, provider), details: e.message, provider, status: e.status };
  } finally {
    inFlight.delete(tabId);
  }
}

messenger.runtime.onMessage.addListener((msg) => {
  if (msg.cmd === 'composeState') return composeState(msg.tabId);
  if (msg.cmd === 'composeTranslate') return composeTranslate(msg.tabId, msg.lang);
  if (msg.cmd === 'composeCancel') { inFlight.get(msg.tabId)?.abort(); return Promise.resolve({ cancelled: true }); }
  return undefined;
});
