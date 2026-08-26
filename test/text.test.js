import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/text.js';

const { splitWhitespace, shouldTranslate, SKIP_TAGS } = globalThis.TM_TEXT;

test('splitWhitespace keeps leading/trailing whitespace separate from the core', () => {
  assert.deepEqual(splitWhitespace('  Hallo Welt \n'), ['  ', 'Hallo Welt', ' \n']);
  assert.deepEqual(splitWhitespace('Hallo'), ['', 'Hallo', '']);
  assert.deepEqual(splitWhitespace('   '), ['   ', '', '']);
});

test('shouldTranslate accepts strings containing a letter in any script', () => {
  assert.equal(shouldTranslate('Hallo'), true);
  assert.equal(shouldTranslate('  こんにちは '), true);
  assert.equal(shouldTranslate('Привет'), true);
});

test('shouldTranslate rejects whitespace, numbers and punctuation-only strings', () => {
  assert.equal(shouldTranslate('   \n'), false);
  assert.equal(shouldTranslate('12345'), false);
  assert.equal(shouldTranslate('---'), false);
  assert.equal(shouldTranslate(''), false);
});

test('SKIP_TAGS covers non-visible text containers', () => {
  for (const tag of ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']) assert.ok(SKIP_TAGS.has(tag), tag);
  assert.ok(!SKIP_TAGS.has('P'));
});

test('SKIP_SELECTOR names quoted text, cite prefixes, signatures and forwarded headers', () => {
  const { SKIP_SELECTOR } = globalThis.TM_TEXT;
  for (const s of ['blockquote[type=cite]', '.gmail_quote', '.moz-cite-prefix', '.moz-signature', '.moz-txt-sig', '.moz-email-headers-table'])
    assert.ok(SKIP_SELECTOR.split(/,\s*/).includes(s), s);
  assert.ok(!SKIP_SELECTOR.includes('moz-forward-container')); // the forwarded body itself must be translated
});
