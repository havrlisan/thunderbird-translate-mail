// Injected into the displayed message (after src/text.js) by background.js on every click.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, SKIP_TAGS } = globalThis.TM_TEXT;

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts }
  let shown = false;
  let subjectEl = null;

  function collect() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && shouldTranslate(n.nodeValue)
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

  function apply({ subject, texts }) {
    nodes.forEach((n, i) => {
      const [lead, , trail] = splitWhitespace(originals[i]);
      n.nodeValue = lead + texts[i] + trail;
    });
    if (subject) {
      subjectEl ??= Object.assign(document.createElement('div'), {
        textContent: api.i18n.getMessage('subjectLine', subject),
        style: 'font-weight:bold;margin:0 0 1em;padding:0 0 .5em;border-bottom:1px solid #ccc',
      });
      document.body.prepend(subjectEl);
    }
    shown = true;
  }

  function restore() {
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    subjectEl?.remove();
    shown = false;
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts };
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect() });
      default:
        return undefined;
    }
  });
}
