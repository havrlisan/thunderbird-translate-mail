// Injected into the displayed message or the compose editor (after src/text.js) by background.js.
// Guarded so repeated injection into the same document is a no-op.
if (!globalThis.__translateMail) {
  globalThis.__translateMail = true;
  const api = globalThis.messenger ?? globalThis.browser; // content scripts: be safe about which global exists
  const { splitWhitespace, shouldTranslate, unwrap, SKIP_TAGS, SKIP_SELECTOR, SAFE_URL } = globalThis.TM_TEXT;

  // Text nodes worth translating, in document order — within `range` when given.
  function walk(skipQuoted, range) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !SKIP_TAGS.has(n.parentNode?.nodeName) && (!range || range.intersectsNode(n)) && shouldTranslate(n.nodeValue) &&
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
  let bounds = [];         // per node: [from, to) of the Original that is translated — a selection can start or end mid-node
  let translation = null;  // last applied { subject, texts, note }
  let settingsKey = null;  // provider|target|quoted the translation was made with
  let shown = false;
  let headerEl = null;     // prepended block: translated subject + "Translated: X → Y" note

  function collect(skipQuoted, range) {
    const clip = (n) => [n === range?.startContainer ? range.startOffset : 0, n === range?.endContainer ? range.endOffset : n.length];
    nodes = walk(skipQuoted, range).filter((n) => shouldTranslate(n.nodeValue.slice(...clip(n))));
    originals = nodes.map((n) => n.nodeValue);
    bounds = nodes.map(clip);
    return originals.map((s, i) => unwrap(splitWhitespace(s.slice(...bounds[i]))[1]));
  }

  function line(text, style) {
    return Object.assign(document.createElement('div'), { textContent: text, style });
  }

  function apply({ subject, texts, note }) {
    nodes.forEach((n, i) => {
      const [from, to] = bounds[i];
      const [lead, core, trail] = splitWhitespace(originals[i].slice(from, to));
      n.nodeValue = originals[i].slice(0, from) + lead + (texts[i] ?? core) + trail + originals[i].slice(to);
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
    nodes.forEach((n, i) => { n.nodeValue = originals[i]; });
    headerEl?.remove();
    headerEl = null; // the next Translation may have a different subject / note, or none
    shown = false;
  }

  // --- Compose editor: each run of reply text goes to the Provider as HTML (so sentences keep their inline
  // formatting and their context) and comes back as HTML, written through execCommand so one Ctrl+Z reverts a
  // run and Ctrl+Y re-applies it. ---

  let ranges = [];   // one Range per run (or the selection)
  let counts = [];   // per Range: how many HTML items it was split into
  let kept = [];     // subtrees lifted out of the sent HTML (quote block, signature), by placeholder id
  let keptSpan = []; // per Range: [first, end) of its ids in `kept`
  let before = [];   // per Range: its HTML as collected, to notice a draft edited while the Provider worked

  // Where an oversized run may be split: only between lines / blocks, never inside a sentence.
  const BREAK = 'br, div, p, ul, ol, table, pre, hr, h1, h2, h3, h4, h5, h6, blockquote';

  const outer = (node) => { const div = document.createElement('div'); div.append(node); return div.innerHTML; };

  // The selection when there is one (quoted text counts then: it was picked on purpose); otherwise one Range per
  // run of body children holding reply text — a child with text but nothing to translate (quote block, signature)
  // ends a run, children without text (<br>) are neutral.
  function composeRanges() {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) return { selection: true, ranges: [sel.getRangeAt(0).cloneRange()] }; // a copy: the live one moves with the caret
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

  // HTML items for one Range: its cloned contents, skipped subtrees replaced by empty placeholders, split only at
  // line / block boundaries once an item exceeds `max` characters (a single oversized block goes alone).
  function items(r, skipQuoted, max) {
    const frag = r.cloneContents();
    if (skipQuoted) {
      for (const el of frag.querySelectorAll(SKIP_SELECTOR)) {
        if (el.parentElement?.closest(SKIP_SELECTOR)) continue; // nested inside a subtree already lifted
        const ph = document.createElement('span');
        ph.dataset.tm = String(kept.push(el) - 1);
        el.replaceWith(ph);
      }
    }
    const out = [];
    let cur = '';
    for (const child of [...frag.childNodes]) {
      const html = outer(child);
      if (cur && cur.length + html.length > max && child.nodeType === 1 && child.matches(BREAK)) { out.push(cur); cur = ''; }
      cur += html;
    }
    if (cur) out.push(cur);
    return out;
  }

  function composeCollect(max) {
    const found = composeRanges();
    const skipQuoted = !found.selection;
    kept = [];
    keptSpan = [];
    ranges = found.ranges.filter((r) => walk(skipQuoted, r).length);
    before = ranges.map((r) => outer(r.cloneContents()));
    const texts = [];
    counts = ranges.map((r) => {
      const from = kept.length;
      const it = items(r, skipQuoted, max);
      keptSpan.push([from, kept.length]);
      texts.push(...it);
      return it.length;
    });
    return { selection: found.selection, texts };
  }

  // Provider HTML back into the draft. Only the markup we sent can come back, but be strict anyway: no scripts,
  // no event handlers, only mail-safe URL schemes (SAFE_URL). Lifted subtrees return in place of their placeholders
  // (`used` collects the ids seen, so a placeholder the Provider dropped can be appended by the caller).
  function clean(html, used) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of doc.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form, input, button, svg')) el.remove();
    for (const el of doc.body.querySelectorAll('*')) {
      for (const a of [...el.attributes]) {
        const url = /(^|:)(href|src|action|formaction)$/i.test(a.name);
        if (/^on/i.test(a.name) || (url && !SAFE_URL.test(a.value.replace(/[\t\n\r]/g, '').trim()))) el.removeAttribute(a.name);
      }
    }
    for (const ph of doc.body.querySelectorAll('span[data-tm]')) {
      const id = Number(ph.dataset.tm);
      used.add(id);
      ph.replaceWith(kept[id] ?? '');
    }
    return doc.body.innerHTML;
  }

  function composeInsert(texts) {
    if (texts.length !== counts.reduce((a, b) => a + b, 0)) return { inserted: false };
    // Draft changed while the Provider worked? Refuse before writing anything, so no run is left half done.
    if (ranges.some((r, k) => outer(r.cloneContents()) !== before[k])) return { inserted: false };
    const sel = window.getSelection();
    let i = 0;
    for (const [k, r] of ranges.entries()) {
      const used = new Set();
      let html = texts.slice(i, i + counts[k]).map((t) => clean(t, used)).join('');
      i += counts[k];
      const [from, end] = keptSpan[k];
      for (let id = from; id < end; id++) if (!used.has(id)) html += outer(kept[id]);
      sel.removeAllRanges();
      sel.addRange(r);
      if (!document.execCommand('insertHTML', false, html)) return { inserted: false };
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
      case 'toggle': {
        // Selection: quoted text counts (it was picked on purpose); whatever is shown is restored first so the Original
        // is what gets collected. ponytail: one Translation per document — a second selection replaces the first.
        if (msg.selection) {
          if (shown) restore();
          const sel = window.getSelection();
          const range = sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null;
          return Promise.resolve({ shown: false, texts: range ? collect(false, range) : [] });
        }
        if (shown) { restore(); return Promise.resolve({ shown: false }); }
        if (translation && settingsKey === msg.settingsKey) { apply(translation); return Promise.resolve({ shown: true }); }
        return Promise.resolve({ shown: false, texts: collect(msg.skipQuoted) });
      }
      case 'composeCollect':
        return Promise.resolve(composeCollect(msg.max ?? 10000)); // fallback = LIMITS.maxChars in providers.js
      case 'composeInsert':
        return Promise.resolve(composeInsert(msg.texts));
      default:
        return undefined;
    }
  });
}
