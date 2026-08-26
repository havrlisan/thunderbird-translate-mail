// Injected into the displayed message (after src/text.js) by background.js on every click.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, SKIP_TAGS, SKIP_SELECTOR } = globalThis.TM_TEXT;

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts, note }
  let shown = false;
  let headerEl = null;     // prepended block: translated subject + "Translated: X → Y" note

  function collect(skipQuoted) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && shouldTranslate(n.nodeValue) &&
        !(skipQuoted && n.parentElement?.closest(SKIP_SELECTOR))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    nodes = [];
    originals = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n);
      originals.push(n.nodeValue);
    }
    return originals.map((s) => splitWhitespace(s)[1]);
  }

  function line(text, style) {
    return Object.assign(document.createElement('div'), { textContent: text, style });
  }

  function apply({ subject, texts, note }) {
    nodes.forEach((n, i) => {
      const [lead, , trail] = splitWhitespace(originals[i]);
      n.nodeValue = lead + (texts[i] ?? splitWhitespace(originals[i])[1]) + trail;
    });
    if (!headerEl) {
      headerEl = line('', 'margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid currentColor');
      if (subject) headerEl.append(line(api.i18n.getMessage('subjectLine', subject), 'font-weight:bold'));
      if (note) headerEl.append(line(note, 'opacity:.7;font-size:.9em'));
    }
    document.body.prepend(headerEl);
    shown = true;
  }

  function restore() {
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    headerEl?.remove();
    shown = false;
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts, note: msg.note };
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
      default:
        return undefined;
    }
  });
}
