import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const load = (l) => JSON.parse(readFileSync(new URL(`../_locales/${l}/messages.json`, import.meta.url), 'utf8'));
const tokens = (s) => (s.match(/\$[A-Z]+\$/g) ?? []).sort();
const en = load('en');

for (const locale of readdirSync(new URL('../_locales', import.meta.url))) {
  if (locale === 'en') continue;
  test(`locale ${locale} matches en`, () => {
    const m = load(locale);
    assert.deepEqual(Object.keys(m).sort(), Object.keys(en).sort());
    for (const [k, v] of Object.entries(en)) {
      assert.deepEqual(tokens(m[k].message), tokens(v.message), `${locale}.${k} placeholders`);
      assert.deepEqual(m[k].placeholders, v.placeholders, `${locale}.${k} placeholder definitions`);
      assert.ok(m[k].message.trim(), `${locale}.${k} empty`);
    }
  });
}
