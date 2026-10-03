// slugify.test.mjs - tests for demo/slugify.mjs (spec AC1-AC14).
// Run with: node --test demo/slugify.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slugify.mjs';

test('AC1: basic phrase is lowercased and joined', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('AC2: hyphen is a separator, words are not glued', () => {
  assert.equal(slugify('foo-bar'), 'foo-bar');
  assert.equal(slugify('a-b'), 'a-b');
  assert.equal(
    slugify('well-known state-of-the-art'),
    'well-known-state-of-the-art',
  );
});

test('AC3: mixed whitespace, underscore and hyphen runs collapse to one separator', () => {
  assert.equal(slugify('a _- b'), 'a-b');
  assert.equal(slugify('  Hello_World  foo '), 'hello-world-foo');
});

test('AC4: other non-alphanumerics are stripped', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('a!b'), 'ab');
});

test('AC5: leading and trailing separators are trimmed', () => {
  assert.equal(slugify('--A!!B--'), 'ab');
  assert.equal(slugify('  x  '), 'x');
});

test('AC6: diacritics are folded to ASCII', () => {
  assert.equal(slugify('Crème Brûlée'), 'creme-brulee');
});

test('AC7: digits are preserved', () => {
  assert.equal(slugify('Top 10 Tips'), 'top-10-tips');
  assert.equal(slugify('2026'), '2026');
});

test('AC8: empty and symbol-only input give an empty string', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});

test('AC9: non-string input throws TypeError', () => {
  for (const bad of [1, null, undefined, {}]) {
    assert.throws(() => slugify(bad), TypeError);
  }
});

test('AC9: non-string separator throws TypeError', () => {
  for (const bad of [1, null, {}, []]) {
    assert.throws(() => slugify('a b', { separator: bad }), TypeError);
  }
});

test('AC10: custom separator, including empty', () => {
  assert.equal(slugify('a b', { separator: '_' }), 'a_b');
  assert.equal(slugify('Ünï  cödé', { separator: '.' }), 'uni.code');
  assert.equal(slugify('a b', { separator: '' }), 'ab');
});

test('AC14: invalid separator throws TypeError', () => {
  for (const bad of ['é', '!', 'a', ' ', '-a', '1']) {
    assert.throws(() => slugify('a b', { separator: bad }), TypeError);
  }
});

const AC_INPUTS = [
  'Hello World',
  'foo-bar',
  'well-known state-of-the-art',
  'a _- b',
  '  Hello_World  foo ',
  'Hello, World!',
  'a!b',
  '--A!!B--',
  '  x  ',
  'Crème Brûlée',
  'Top 10 Tips',
  '',
  '!!!',
  'a -!- b',
  'a.!.b',
  'a~b _ c.d',
];

test('AC11: idempotent with the default separator', () => {
  for (const input of AC_INPUTS) {
    const once = slugify(input);
    assert.equal(slugify(once), once, `input ${JSON.stringify(input)}`);
  }
});

test('AC11: mandatory example a -!- b -> a-b, second pass identical', () => {
  assert.equal(slugify('a -!- b'), 'a-b');
  assert.equal(slugify(slugify('a -!- b')), 'a-b');
});

test('AC12: idempotent with custom separators', () => {
  for (const separator of ['_', '.', '--', '', '~', '-_']) {
    for (const input of AC_INPUTS) {
      const once = slugify(input, { separator });
      assert.equal(
        slugify(once, { separator }),
        once,
        `separator ${JSON.stringify(separator)}, input ${JSON.stringify(input)}`,
      );
    }
  }
  assert.equal(
    slugify(slugify('Hello, World!', { separator: '.' }), { separator: '.' }),
    'hello.world',
  );
});

test('AC12: mandatory example a.!.b with separator "." -> a.b, second pass identical', () => {
  const options = { separator: '.' };
  assert.equal(slugify('a.!.b', options), 'a.b');
  assert.equal(slugify(slugify('a.!.b', options), options), 'a.b');
});

test('AC13: output charset under default, "." and "_" separators', () => {
  const cases = [
    [undefined, /^[a-z0-9-]*$/],
    ['.', /^[a-z0-9.]*$/],
    ['_', /^[a-z0-9_]*$/],
  ];
  for (const [separator, pattern] of cases) {
    const options = separator === undefined ? undefined : { separator };
    for (const input of AC_INPUTS) {
      const out = slugify(input, options);
      assert.match(out, pattern, `separator ${separator}, input ${JSON.stringify(input)}`);
    }
  }
});
