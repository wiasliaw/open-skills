// node --test suite for memory.mjs. Fixture ledgers are built in temp dirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'memory.mjs');

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, `stdout must be exactly one line: ${r.stdout}`);
  return { code: r.status, out: JSON.parse(lines[0]) };
}

function entry(fm, body = 'Outcome and rationale.') {
  const lines = Object.entries(fm).map(([k, v]) => (Array.isArray(v) ? `${k}: [${v.join(', ')}]` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

const base = (n, extra = {}) => ({
  id: `u-1.build.${n}`,
  target: 'ARCHITECTURE.md',
  date: '2026-10-05T10:00:00Z',
  title: `Entry ${n}`,
  type: 'decision',
  status: 'pending',
  ...extra,
});

const roots = [];
function fixture({ memory, docs = {}, deltas = {}, config } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'memory-test-'));
  roots.push(root);
  mkdirSync(join(root, '.harness', 'deltas'), { recursive: true });
  const cfg = config ?? { schema_version: '1.0.0', ...(memory ? { memory } : {}) };
  writeFileSync(join(root, '.harness', 'config.json'), JSON.stringify(cfg));
  for (const [n, t] of Object.entries(docs)) writeFileSync(join(root, '.harness', n), t);
  for (const [n, t] of Object.entries(deltas)) writeFileSync(join(root, '.harness', 'deltas', n), t);
  return root;
}

test.after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

test('help prints one JSON object and exits 0', () => {
  const { code, out } = run(['--help']);
  assert.equal(code, 0);
  assert.equal(out.ok, true);
});

test('unknown command is a USAGE error with exit 2', () => {
  const { code, out } = run(['bogus']);
  assert.equal(code, 2);
  assert.equal(out.error.code, 'USAGE');
});

test('missing config is CONFIG_NOT_FOUND', () => {
  const root = mkdtempSync(join(tmpdir(), 'memory-test-'));
  roots.push(root);
  const { code, out } = run(['check', '--root', root]);
  assert.equal(code, 2);
  assert.equal(out.error.code, 'CONFIG_NOT_FOUND');
});

test('invalid config values are CONFIG_INVALID', () => {
  const root = fixture({ memory: { budgets: { 'A.md': 0 } } });
  const { code, out } = run(['check', '--root', root]);
  assert.equal(code, 2);
  assert.equal(out.error.code, 'CONFIG_INVALID');
});

test('default index lists pending only; --all adds applied and rejected', () => {
  const root = fixture({
    memory: { budgets: { 'ARCHITECTURE.md': 10 } },
    docs: { 'ARCHITECTURE.md': 'a\nb\nc\n' },
    deltas: {
      'a.md': entry(base(1)),
      'b.md': entry(base(2, { status: 'applied' })),
      'c.md': entry(base(3, { status: 'rejected', supersedes: ['u-1.build.1'] })),
    },
  });
  const d = run(['index', '--root', root]).out;
  assert.deepEqual(d.deltas.map((e) => e.id), ['u-1.build.1']);
  assert.deepEqual(d.counts, { pending: 1, applied: 1, rejected: 1, other: 0 });
  assert.equal(d.current_truth[0].lines, 3);
  assert.match(d.markdown, /ARCHITECTURE\.md \(3\/10 lines\)/);
  const all = run(['index', '--all', '--root', root]).out;
  assert.equal(all.deltas.length, 3);
  assert.deepEqual(all.deltas[2].relations, { supersedes: ['u-1.build.1'] });
});

test('index is regenerable and reflects entries from both merged sides', () => {
  const root = fixture({ memory: {}, deltas: { 'x.md': entry(base(1)), 'y.md': entry({ ...base(1), id: 'u-2.spec.1' }) } });
  const a = run(['index', '--root', root]).out;
  const b = run(['index', '--root', root]).out;
  assert.deepEqual(a, b);
  assert.deepEqual(a.deltas.map((e) => e.id).sort(), ['u-1.build.1', 'u-2.spec.1']);
});

test('missing current-truth document reads as empty', () => {
  const root = fixture({ memory: { budgets: { 'CONSTRAINTS.md': 5 } } });
  const d = run(['index', '--root', root]).out;
  assert.equal(d.current_truth[0].exists, false);
  assert.equal(d.current_truth[0].lines, 0);
});

test('budget breach is reported as due maintenance with exit 0', () => {
  const root = fixture({
    memory: { budgets: { 'ARCHITECTURE.md': 2 } },
    docs: { 'ARCHITECTURE.md': '1\n2\n3\n' },
  });
  const { code, out } = run(['check', '--root', root]);
  assert.equal(code, 0);
  assert.equal(out.maintenance_due, true);
  assert.equal(out.trigger_source, 'maintenance-due');
  assert.equal(out.reasons[0].kind, 'budget-pressure');
  const v = run(['validate', '--root', root]);
  assert.equal(v.code, 0);
  assert.equal(v.out.budget_breaches.length, 1);
});

test('pending threshold: breach only when count exceeds N', () => {
  const deltas = { 'a.md': entry(base(1)), 'b.md': entry(base(2)), 'c.md': entry(base(3, { status: 'applied' })) };
  const at = fixture({ memory: { pending_delta_threshold: 2 }, deltas });
  assert.equal(run(['check', '--root', at]).out.maintenance_due, false);
  const over = fixture({ memory: { pending_delta_threshold: 1 }, deltas });
  const r = run(['check', '--root', over]);
  assert.equal(r.code, 0);
  assert.equal(r.out.maintenance_due, true);
  assert.deepEqual(r.out.reasons[0], { kind: 'pending-delta-threshold', pending: 2, threshold: 1 });
});

test('no thresholds declared means never due', () => {
  const root = fixture({ deltas: { 'a.md': entry(base(1)) } });
  assert.equal(run(['check', '--root', root]).out.maintenance_due, false);
});

test('valid ledger passes validation', () => {
  const root = fixture({
    deltas: {
      'a.md': entry(base(1)),
      'b.md': entry(base(2, { supersedes: ['u-1.build.1'], 'depends-on': [] })),
    },
  });
  const { code, out } = run(['validate', '--root', root]);
  assert.equal(code, 0);
  assert.equal(out.entries_checked, 2);
});

test('validation catches missing fields, bad id, bad status, bad date, no frontmatter', () => {
  const { target, ...noTarget } = base(1);
  const root = fixture({
    deltas: {
      'a.md': entry(noTarget),
      'b.md': entry(base(2, { id: 'not-an-id' })),
      'c.md': entry(base(3, { status: 'done' })),
      'd.md': entry(base(4, { date: '2026-10-05' })),
      'e.md': 'no frontmatter here\n',
    },
  });
  const { code, out } = run(['validate', '--root', root]);
  assert.equal(code, 1);
  assert.equal(out.error.code, 'VALIDATION_FAILED');
  const codes = out.problems.map((p) => p.code);
  for (const c of ['MISSING_FIELD', 'BAD_ID', 'BAD_STATUS', 'BAD_DATE', 'FRONTMATTER_PARSE']) {
    assert.ok(codes.includes(c), `expected ${c}`);
  }
});

test('validation catches dangling relations and duplicate ids', () => {
  const root = fixture({
    deltas: {
      'a.md': entry(base(1, { 'verified-by': ['u-9.review.1'] })),
      'b.md': entry(base(2)),
      'c.md': entry(base(2)),
    },
  });
  const { code, out } = run(['validate', '--root', root]);
  assert.equal(code, 1);
  const codes = out.problems.map((p) => p.code);
  assert.ok(codes.includes('DANGLING_RELATION'));
  assert.ok(codes.includes('DUPLICATE_ID'));
});

test('block-list relations and quoted values parse', () => {
  const text = `---\nid: u-1.build.1\ntarget: ARCHITECTURE.md\ndate: "2026-10-05T10:00:00Z"\ntitle: "A: colon title"\ntype: decision\nstatus: pending\nsupersedes:\n  - u-0.build.1\n---\nbody\n`;
  const root = fixture({
    deltas: { 'a.md': text, 'old.md': entry({ ...base(1), id: 'u-0.build.1' }) },
  });
  const { code, out } = run(['validate', '--root', root]);
  assert.equal(code, 0, JSON.stringify(out));
  const idx = run(['index', '--root', root]).out;
  assert.equal(idx.deltas.find((e) => e.id === 'u-1.build.1').title, 'A: colon title');
});

test('drafts: sibling drafts satisfy relations; stage must match node segment', () => {
  const root = fixture({ deltas: { 'a.md': entry({ ...base(1), id: 'old-1.build.1' }) } });
  const unit = join(root, 'unit');
  mkdirSync(join(unit, 'spec'), { recursive: true });
  writeFileSync(join(unit, 'spec', 'delta-1.md'), entry({ ...base(1), id: 'u-1.spec.1' }));
  writeFileSync(join(unit, 'spec', 'delta-2.md'), entry({ ...base(2), id: 'u-1.spec.2', supersedes: ['u-1.spec.1', 'old-1.build.1'] }));
  const ok = run(['validate', '--root', root, '--drafts', unit]);
  assert.equal(ok.code, 0, JSON.stringify(ok.out));
  assert.equal(ok.out.entries_checked, 3);
  writeFileSync(join(unit, 'spec', 'delta-3.md'), entry({ ...base(3), id: 'u-1.build.3' }));
  const bad = run(['validate', '--root', root, '--drafts', unit]);
  assert.equal(bad.code, 1);
  assert.equal(bad.out.problems[0].code, 'BAD_ID');
});

test('invalid frontmatter is listed, not fatal, in index', () => {
  const root = fixture({ deltas: { 'a.md': entry(base(1)), 'bad.md': 'oops\n' } });
  const { code, out } = run(['index', '--root', root]);
  assert.equal(code, 0);
  assert.equal(out.invalid.length, 1);
  assert.equal(out.deltas.length, 1);
});
