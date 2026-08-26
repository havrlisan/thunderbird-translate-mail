// Injected into the displayed message or the compose editor (after src/text.js) by background.js.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, unwrap, SKIP_TAGS, SKIP_SELECTOR } = globalThis.TM_TEXT;

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts, note }
  let settingsKey = null;  // provider|target|quoted the translation was made with
  let shown = false;
  let headerEl = null;     // prepended block: translated subject + "Translated: X → Y" note

  // Text nodes worth translating, in document order.
  function walk(skipQuoted) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && shouldTranslate(n.nodeValue) &&
        !(skipQuoted && n.parentElement?.closest(SKIP_SELECTOR))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  function collect(found) {
    nodes = found;
    originals = nodes.map((n) => n.nodeValue);
    return originals.map((s) => unwrap(splitWhitespace(s)[1]));
  }

  // The Original is as it was when last shown: same text nodes with the same text. Edits, new paragraphs and
  // editor rewrites all count as changes and get a fresh translation.
  const unchanged = (found) => found.length === nodes.length && found.every((n, i) => n.nodeValue === originals[i]);

  function line(text, style) {
    return Object.assign(document.createElement('div'), { textContent: text, style });
  }

  function apply({ subject, texts, note }) {
    nodes.forEach((n, i) => {
      const [lead, , trail] = splitWhitespace(originals[i]);
      n.nodeValue = lead + (texts[i] ?? splitWhitespace(originals[i])[1]) + trail;
    });
    if (!headerEl && (subject || note)) {
      headerEl = line('', 'margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid currentColor');
      if (subject) headerEl.append(line(api.i18n.getMessage('subjectLine', subject), 'font-weight:bold'));
      if (note) headerEl.append(line(note, 'opacity:.7;font-size:.9em'));
    }
    if (headerEl) document.body.prepend(headerEl);
    shown = true;
  }

  function restore() {
    // Snapshot the text as it is now, so edits made to the Translation come back with it.
    translation.texts = nodes.map((n) => splitWhitespace(n.nodeValue)[1]);
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    headerEl?.remove();
    shown = false;
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts, note: msg.note };
        settingsKey = msg.settingsKey;
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle': {
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        const found = walk(msg.skipQuoted);
        if (translation && settingsKey === msg.settingsKey && unchanged(found)) {
          nodes = found;
          apply(translation);
          return Promise.resolve({ shown: true });
        }
        return Promise.resolve({ shown: false, texts: collect(found) });
      }
      case 'state':
        return Promise.resolve({ shown });
      default:
        return undefined;
    }
  });
}
