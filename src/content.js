// Injected into the displayed message or the compose editor (after src/text.js) by background.js.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, unwrap, SKIP_TAGS, SKIP_SELECTOR } = globalThis.TM_TEXT;

  // The part of text node `n` inside `range` (all of it without a range).
  function part(n, range) {
    if (!range) return n.nodeValue;
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
    return n.nodeValue.slice(start, end);
  }

  // Text nodes worth translating, in document order — within `range` when given.
  function walk(skipQuoted, range) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && (!range || range.intersectsNode(n)) && shouldTranslate(part(n, range)) &&
        !(skipQuoted && n.parentElement?.closest(SKIP_SELECTOR))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  // --- Message display: rewrite text nodes in place; toggling restores the Original. ---

  let nodes = [];          // text nodes in document order
  let originals = [];      // their Original nodeValue
  let translation = null;  // last applied { subject, texts, note }
  let settingsKey = null;  // provider|target|quoted the translation was made with
  let shown = false;
  let headerEl = null;     // prepended block: translated subject + "Translated: X → Y" note

  function collect(skipQuoted) {
    nodes = walk(skipQuoted);
    originals = nodes.map((n) => n.nodeValue);
    return originals.map((s) => unwrap(splitWhitespace(s)[1]));
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

  // --- Compose editor: write through execCommand, so one Ctrl+Z reverts a run and Ctrl+Y re-applies it. ---

  let ranges = [];  // one Range per run (or the selection)
  let parts = [];   // per Range: [{ node, text }] — the translatable text nodes and the part of each inside the Range

  // Every text node inside `root` (a fragment), or the body's text nodes intersecting `range`, in document order.
  function textNodes(root, range) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, range
      ? { acceptNode: (n) => (range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) }
      : null);
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  // The selection when there is one (quoted text counts then: it was picked on purpose); otherwise one Range per
  // run of body children holding reply text — a child with text but nothing to translate (quote block, signature)
  // ends a run, children without text (<br>) are neutral.
  function composeRanges() {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) return { selection: true, ranges: [sel.getRangeAt(0)] };
    const root = document.body;
    const childOf = (n) => { while (n.parentNode !== root) n = n.parentNode; return n; };
    const withText = new Set(walk(true).map(childOf));
    const out = [];
    let run = null;
    for (const child of root.childNodes) {
      if (withText.has(child)) {
        if (!run) { run = document.createRange(); run.setStartBefore(child); out.push(run); }
        run.setEndAfter(child);
      } else if (child.textContent.trim()) {
        run = null;
      }
    }
    return { selection: false, ranges: out };
  }

  function composeCollect() {
    const found = composeRanges();
    ranges = found.ranges;
    parts = ranges.map((r) => walk(!found.selection, r).map((node) => ({ node, text: part(node, r) })));
    return { selection: found.selection, texts: parts.flat().map((p) => unwrap(splitWhitespace(p.text)[1])) };
  }

  // Replace each Range with a copy of itself in which only the translatable text nodes carry the Translation. The
  // clone mirrors the Range, so its text nodes pair up with the live ones by index.
  function composeInsert(texts) {
    const sel = window.getSelection();
    let i = 0;
    for (const [k, r] of ranges.entries()) {
      const byNode = new Map(parts[k].map((p) => [p.node, p.text]));
      const frag = r.cloneContents();
      const live = textNodes(document.body, r);
      let matched = 0;
      textNodes(frag).forEach((copy, j) => {
        const text = byNode.get(live[j]);
        if (text === undefined) return;
        matched++;
        const [lead, core, trail] = splitWhitespace(text);
        copy.nodeValue = lead + (texts[i++] ?? core) + trail;
      });
      // Collected before a slow Provider call; if the draft's nodes changed meanwhile, fail rather than write into the wrong ones.
      if (matched !== parts[k].length) return { inserted: false };
      const div = document.createElement('div');
      div.append(frag);
      sel.removeAllRanges();
      sel.addRange(r);
      if (!document.execCommand('insertHTML', false, div.innerHTML)) return { inserted: false };
    }
    return { inserted: true };
  }

  api.runtime.onMessage.addListener((msg) => {
    switch (msg.cmd) {
      case 'apply':
        translation = { subject: msg.subject, texts: msg.texts, note: msg.note };
        settingsKey = msg.settingsKey;
        apply(translation);
        return Promise.resolve({ shown: true });
      case 'toggle':
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
      case 'composeCollect':
        return Promise.resolve(composeCollect());
      case 'composeInsert':
        return Promise.resolve(composeInsert(msg.texts));
      default:
        return undefined;
    }
  });
}
