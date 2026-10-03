# demo

`slugify.mjs` is a small, zero-dependency ESM module exporting `slugify(input, options?)`. It lowercases, trims, strips accents, and drops other non-alphanumerics. Runs of hyphens, underscores, and whitespace each collapse into a single separator (default `-`); hyphens are never stripped. Non-string input throws a `TypeError`.

## Behavior

- **Idempotent:** `slugify(slugify(x)) === slugify(x)`, including with a custom separator.
- **Options:** the only option is `{ separator }`. It is validated: the allowed charset is `-_.~`, an empty string is allowed, and anything else throws a `TypeError`.

## Run the tests

```sh
node --test demo/slugify.test.mjs
```

Requires Node.js >= 20.

## Provenance

This folder was produced as a graph-flow demo work unit. The path it took:

research-explore, human gate (grading: trivial), build, review (FAIL, fast-path upgrade), spec, human gate (spec), ticket, build, review.

The work-unit record lives under `.project/work-units/2026-10-03-demo-slugify/`.
