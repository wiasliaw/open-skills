// slugify.mjs - turns arbitrary text into a URL-friendly slug.
//
// Usage:
//   import { slugify } from './slugify.mjs';
//   slugify('Crème Brûlée');                          // 'creme-brulee'
//   slugify('Hello World', { separator: '_' });       // 'hello_world'
//
// Requirements: Node.js >= 20. No dependencies.
//
// Behavior: lowercases, strips accents (NFKD + combining marks), drops every
// character that is not [a-z0-9], whitespace, '_', '-' or a separator
// character, then collapses each run of whitespace, '_', '-' and separator
// characters into one separator and trims it from both ends. Hyphens are
// separators, never stripped, so the function is idempotent.
// Throws TypeError when the input is not a string, or when the separator is
// not a string made only of the characters - _ . ~ (empty is allowed).

export function slugify(input, { separator = '-' } = {}) {
  if (typeof input !== 'string') {
    throw new TypeError('slugify: input must be a string');
  }
  if (typeof separator !== 'string' || !/^[-_.~]*$/.test(separator)) {
    throw new TypeError('slugify: separator must be a string of - _ . ~ characters');
  }

  // Separator characters are only - _ . ~, safe to place in a class once escaped.
  const sepChars = [...new Set(separator)].map((c) => `\\${c}`).join('');

  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const stripped = normalized.replace(
    new RegExp(`[^a-z0-9\\s_\\-${sepChars}]`, 'g'),
    '',
  );

  const collapsed = stripped.replace(
    new RegExp(`[\\s_\\-${sepChars}]+`, 'g'),
    separator,
  );

  let result = collapsed;
  if (separator !== '') {
    if (result.startsWith(separator)) result = result.slice(separator.length);
    if (result.endsWith(separator)) result = result.slice(0, -separator.length);
  }
  return result;
}
