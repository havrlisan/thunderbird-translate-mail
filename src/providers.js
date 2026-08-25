// Every Provider auto-detects the Source Language and returns it with the Translation.
// Each `translate` handles ONE request; `translateAll` chunks and concatenates.

export const LIMITS = { maxItems: 50, maxChars: 20000 }; // under every Provider's per-request limit

export function chunk(texts, { maxItems, maxChars } = LIMITS) {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= maxItems || chars + t.length > maxChars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function postJson(fetchFn, url, headers, body) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// DeepL wants regional variants for these; everything else is the upper-cased ISO code.
const DEEPL_TARGET = { en: 'EN-US', pt: 'PT-PT' };

export const PROVIDERS = {
  google: {
    name: 'Google Cloud Translation',
    fields: ['apiKey'],
    async translate(texts, target, creds, fetchFn) {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(creds.apiKey)}`;
      const data = await postJson(fetchFn, url, {}, { q: texts, target, format: 'text' });
      const t = data.data.translations;
      return { texts: t.map((x) => x.translatedText), detected: t[0]?.detectedSourceLanguage };
    },
  },
  microsoft: {
    name: 'Microsoft Translator',
    fields: ['apiKey', 'region'],
    async translate(texts, target, creds, fetchFn) {
      const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(target)}`;
      const headers = { 'Ocp-Apim-Subscription-Key': creds.apiKey, 'Ocp-Apim-Subscription-Region': creds.region };
      const data = await postJson(fetchFn, url, headers, texts.map((Text) => ({ Text })));
      return { texts: data.map((x) => x.translations[0].text), detected: data[0]?.detectedLanguage?.language };
    },
  },
  deepl: {
    name: 'DeepL',
    fields: ['apiKey'],
    async translate(texts, target, creds, fetchFn) {
      const host = creds.apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
      const body = { text: texts, target_lang: DEEPL_TARGET[target] ?? target.toUpperCase() };
      const data = await postJson(fetchFn, `https://${host}/v2/translate`, { Authorization: `DeepL-Auth-Key ${creds.apiKey}` }, body);
      return { texts: data.translations.map((x) => x.text), detected: data.translations[0]?.detected_source_language?.toLowerCase() };
    },
  },
  yandex: {
    name: 'Yandex Translate',
    fields: ['apiKey', 'folderId'],
    async translate(texts, target, creds, fetchFn) {
      const body = { folderId: creds.folderId, texts, targetLanguageCode: target };
      const data = await postJson(fetchFn, 'https://translate.api.cloud.yandex.net/translate/v2/translate', { Authorization: `Api-Key ${creds.apiKey}` }, body);
      return { texts: data.translations.map((x) => x.text), detected: data.translations[0]?.detectedLanguageCode };
    },
  },
};

export async function translateAll(providerId, texts, target, creds, fetchFn = fetch) {
  const provider = PROVIDERS[providerId];
  const out = [];
  let detected;
  for (const part of chunk(texts)) {
    const r = await provider.translate(part, target, creds, fetchFn);
    if (r.texts.length !== part.length) throw new Error(`Provider returned ${r.texts.length} translations for ${part.length} texts`);
    out.push(...r.texts);
    detected ??= r.detected;
  }
  return { texts: out, detected: (detected || '').toLowerCase().split('-')[0] };
}
