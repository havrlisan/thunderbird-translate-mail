// Every Provider auto-detects the Source Language and returns it with the Translation.
// Each `translate` handles ONE request, auto-detecting unless `source` is given; `translateAll` detects, pins and chunks.

export const LIMITS = { maxItems: 50, maxChars: 10000 }; // Yandex caps a request at 10 000 chars; the others allow more

// The Provider detects per item; the longest input is the most reliable sample.
function longestIndex(texts) {
  let best = 0;
  for (let i = 1; i < texts.length; i++) if (texts[i].length > texts[best].length) best = i;
  return best;
}

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
  }).catch((e) => { throw Object.assign(e, { network: true }); }); // host unreachable, DNS, TLS…
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
  return res.json();
}

// DeepL wants regional variants for these; everything else is the upper-cased ISO code.
const DEEPL_TARGET = { en: 'EN-US', pt: 'PT-PT' };
// Microsoft rejects plain `zh`/`sr`; Google and Yandex know Norwegian as `no`.
const MICROSOFT_TARGET = { zh: 'zh-Hans', sr: 'sr-Latn' };
const GOOGLE_TARGET = { nb: 'no' };
const YANDEX_TARGET = { nb: 'no' };

// Google v2 escapes HTML entities in text mode (format=text); in HTML mode the markup comes back as is.
const decodeEntities = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export const PROVIDERS = {
  google: {
    name: 'Google Cloud Translation',
    help: 'https://console.cloud.google.com/apis/credentials',
    fields: ['apiKey'],
    async translate(texts, target, creds, fetchFn, { source, html } = {}) {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(creds.apiKey)}`;
      const body = { q: texts, target: GOOGLE_TARGET[target] ?? target, format: html ? 'html' : 'text' };
      if (source) body.source = GOOGLE_TARGET[source] ?? source;
      const data = await postJson(fetchFn, url, {}, body);
      const t = data.data.translations;
      return { texts: t.map((x) => (html ? x.translatedText : decodeEntities(x.translatedText))), detected: t[longestIndex(texts)]?.detectedSourceLanguage };
    },
  },
  microsoft: {
    name: 'Microsoft Translator',
    help: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation',
    fields: ['apiKey', 'region'],
    async translate(texts, target, creds, fetchFn, { source, html } = {}) {
      const from = source ? `&from=${encodeURIComponent(MICROSOFT_TARGET[source] ?? source)}` : '';
      const type = html ? '&textType=html' : '';
      const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(MICROSOFT_TARGET[target] ?? target)}${from}${type}`;
      const headers = { 'Ocp-Apim-Subscription-Key': creds.apiKey, 'Ocp-Apim-Subscription-Region': creds.region };
      const data = await postJson(fetchFn, url, headers, texts.map((Text) => ({ Text })));
      return { texts: data.map((x) => x.translations[0].text), detected: data[longestIndex(texts)]?.detectedLanguage?.language };
    },
  },
  deepl: {
    name: 'DeepL',
    help: 'https://www.deepl.com/your-account/keys',
    fields: ['apiKey'],
    async translate(texts, target, creds, fetchFn, { source, html } = {}) {
      const host = creds.apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
      const body = { text: texts, target_lang: DEEPL_TARGET[target] ?? target.toUpperCase() };
      if (source) body.source_lang = source.toUpperCase(); // no regional variants on the source side
      if (html) body.tag_handling = 'html';
      const data = await postJson(fetchFn, `https://${host}/v2/translate`, { Authorization: `DeepL-Auth-Key ${creds.apiKey}` }, body);
      return { texts: data.translations.map((x) => x.text), detected: data.translations[longestIndex(texts)]?.detected_source_language?.toLowerCase() };
    },
  },
  yandex: {
    name: 'Yandex Translate',
    help: 'https://console.cloud.yandex.com/',
    fields: ['apiKey', 'folderId'],
    async translate(texts, target, creds, fetchFn, { source, html } = {}) {
      const body = { folderId: creds.folderId, texts, targetLanguageCode: YANDEX_TARGET[target] ?? target };
      if (source) body.sourceLanguageCode = YANDEX_TARGET[source] ?? source;
      if (html) body.format = 'HTML'; // per Yandex's API reference (PLAIN_TEXT is the default); unverified live, like the rest of Yandex
      const data = await postJson(fetchFn, 'https://translate.api.cloud.yandex.net/translate/v2/translate', { Authorization: `Api-Key ${creds.apiKey}` }, body);
      return { texts: data.translations.map((x) => x.text), detected: data.translations[longestIndex(texts)]?.detectedLanguageCode };
    },
  },
};

// i18n key explaining a failed request; `e` comes from postJson (status / network) or is anything else.
export function errorKey(e, providerId) {
  const status = e.status;
  return status === 401 || status === 403 ? (providerId === 'microsoft' ? 'errorAuthMicrosoft' : 'errorAuth')
    : status === 429 || status === 456 ? 'errorQuota' // 456 = DeepL quota exceeded
    : status ? 'errorHttp'
    : e.network ? 'errorNetwork'
    : 'errorGeneric';
}

// Text mode only (HTML mode sends whole sentences): DeepL drops the trailing punctuation of short fragments
// ("Hello," → "Pozdrav"); put it back when the Translation ends without any sentence punctuation of its own.
export function keepEnding(src, out) {
  const m = /[.,;:!?…]+$/.exec(src);
  return m && !/[.,;:!?…。！？、]$/.test(out) ? out + m[0] : out;
}

const code = (s) => (s || '').toLowerCase().split('-')[0];

function checked(r, part) {
  if (r.texts.length !== part.length) throw new Error(`Provider returned ${r.texts.length} translations for ${part.length} texts`);
  return r;
}

// Detect on the longest text alone, then translate the rest with the Source Language pinned: a short fragment
// ("bold") auto-detected on its own is a coin toss. Nothing is sent twice, and the second round is skipped when
// the text is already in the Target Language (those texts come back unchanged).
export async function translateAll(providerId, texts, target, creds, fetchFn = fetch, { html = false } = {}) {
  const provider = PROVIDERS[providerId];
  if (!texts.length) return { texts: [], detected: '' };
  const best = longestIndex(texts);
  const first = checked(await provider.translate([texts[best]], target, creds, fetchFn, { html }), [texts[best]]);
  const detected = code(first.detected);
  const out = texts.slice();
  out[best] = first.texts[0];
  if (detected !== target) {
    const rest = texts.map((_, i) => i).filter((i) => i !== best);
    let k = 0;
    for (const part of chunk(rest.map((i) => texts[i]))) {
      const r = checked(await provider.translate(part, target, creds, fetchFn, { source: detected || undefined, html }), part);
      for (const t of r.texts) out[rest[k++]] = t;
    }
  }
  return { texts: out.map((t, i) => (html ? t : keepEnding(texts[i], t))), detected };
}
