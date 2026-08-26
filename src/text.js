// Classic script (no import/export): injected into the message before content.js,
// and loaded by tests for its side effect on globalThis.
globalThis.TM_TEXT = {
  // 'Hello ' -> ['', 'Hello', ' ']. Providers strip surrounding whitespace, so we
  // send the core and re-attach lead/trail when writing the translation back.
  splitWhitespace(s) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    return [m[1], m[2], m[3]];
  },
  // Only strings containing a letter are worth a Provider call.
  shouldTranslate(s) {
    return /\p{L}/u.test(s);
  },
  // Text inside these elements is never visible prose.
  SKIP_TAGS: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']),
  // Quoted replies, "On … wrote:" lines, signatures and inline-forward headers (Thunderbird HTML + plain-text
  // rendering, Gmail, Apple Mail). Skipped unless the user opts to translate quoted text too.
  SKIP_SELECTOR: 'blockquote[type=cite], .gmail_quote, .moz-cite-prefix, .moz-signature, .moz-txt-sig, .moz-email-headers-table',
};
