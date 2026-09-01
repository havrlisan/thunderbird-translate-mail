// Classic script (no import/export): injected into the message before content.js,
// and loaded by tests for its side effect on globalThis.
// No top-level let/const/class here: background.js re-injects this file into the same document on every
// click, and a redeclared lexical binding is a SyntaxError that leaves that click hanging.
globalThis.TM_TEXT = {
  // 'Hello ' -> ['', 'Hello', ' ']. Providers strip surrounding whitespace, so we
  // send the core and re-attach lead/trail when writing the translation back.
  splitWhitespace(s) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    return [m[1], m[2], m[3]];
  },
  // Non-flowed plain-text mail arrives as one text node with hard-wrapped lines; Providers treat each
  // newline as a sentence boundary. Join a line to the next when it is long enough to have been wrapped
  // (>= 40 chars) and the next line is not blank, indented, or a bullet / numbered / quote line.
  // ponytail: fixed length heuristic; short wrapped lines (long word pushed down) stay fragments as before.
  unwrap(s) {
    return s.replace(/(?<=[^\n]{40,})[ \t]*\n(?!\n|[ \t]|[-*•>]|\d+[.)])/g, ' ');
  },
  // Only strings containing a letter — and not a bare link (URL or e-mail address: nothing to translate, and its
  // length would make it the detection sample) — are worth a Provider call.
  shouldTranslate(s) {
    const core = s.trim();
    return /\p{L}/u.test(core) && !/^(?:https?:\/\/\S+|www\.\S+|[^\s@]+@[^\s@]+\.[^\s@]+)$/i.test(core);
  },
  // Text inside these elements is never visible prose.
  SKIP_TAGS: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']),
  // Quoted replies, "On … wrote:" lines, signatures and inline-forward headers (Thunderbird HTML + plain-text
  // rendering, Gmail, Apple Mail, plain-text compose). Skipped unless the user opts to translate quoted text too.
  SKIP_SELECTOR: 'blockquote[type=cite], span[_moz_quote], .gmail_quote, .moz-cite-prefix, .moz-signature, .moz-txt-sig, .moz-email-headers-table',
  // URL schemes allowed back into a draft from a Provider's HTML: what mail links and inline images use; nothing that
  // could carry script. Callers strip tab/CR/LF first (Gecko does when resolving, so "java\nscript:" is live).
  SAFE_URL: /^(?:https?:|mailto:|cid:|tel:|#|\/|data:image\/|[^:]*$)/i,
};
