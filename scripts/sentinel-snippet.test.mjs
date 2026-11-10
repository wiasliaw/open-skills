// Tests for the wait snippet in agents/sentinel.md.
// Extracts the first ```bash block, splits it at the exact line "# sentinel-body",
// and runs the body under bash with a parameter block supplied by each case.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SENTINEL_MD = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'agents',
  'sentinel.md',
);
const MARKER = '# sentinel-body';

function extractBody() {
  const md = fs.readFileSync(SENTINEL_MD, 'utf8');
  const m = md.match(/^```bash\r?\n([\s\S]*?)^```/m);
  assert.ok(m, 'agents/sentinel.md has no fenced ```bash block');
  const lines = m[1].split(/\r?\n/);
  const idx = lines.indexOf(MARKER);
  assert.ok(idx >= 0, `snippet has no exact "${MARKER}" line`);
  return lines.slice(idx + 1).join('\n');
}

const BODY = extractBody();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Build and run: test parameter block, then the extracted body.
function runSnippet({ check, baseline, interval = '1', limit = '6', fails = '0' }) {
  const script = [
    'CHECK=$(cat <<\'SENTINEL_CHECK\'',
    check,
    'SENTINEL_CHECK',
    ')',
    'BASELINE=$(cat <<\'SENTINEL_BASELINE\'',
    baseline,
    'SENTINEL_BASELINE',
    ')',
    `INTERVAL=${interval}`,
    `LIMIT=${limit}`,
    `FAILS=${fails}`,
    BODY,
  ].join('\n');
  const started = Date.now();
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.error, undefined, 'bash failed to run: ' + r.error);
  return { out: r.stdout, status: r.status, ms: Date.now() - started };
}

function lines(out) {
  return out.split('\n').filter((l) => l !== '');
}

test('1. changed: file created after 2 s', () => {
  const file = path.join(TMP, 'trigger');
  const child = spawn('bash', ['-c', `sleep 2; touch '${file}'`], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const r = runSnippet({
    check: `[ -e '${file}' ] && echo present || echo absent`,
    baseline: 'absent',
  });
  assert.equal(r.status, 0);
  assert.deepEqual(lines(r.out), ['SENTINEL_CHANGED', 'present']);
});

test('2. quoting: quotes and pipe pass intact, nothing runs in the outer shell', () => {
  const r = runSnippet({
    check: [
      `echo 'a b' "c" | tr a-z A-Z`,
      `echo "q'; echo OUTER_RAN_\\$((1+1)); '"`,
    ].join('\n'),
    baseline: 'x',
    limit: '3',
  });
  assert.equal(r.status, 0);
  const l = lines(r.out);
  assert.equal(l[0], 'SENTINEL_CHANGED');
  assert.ok(r.out.includes('A B C'), 'piped result missing: ' + r.out);
  assert.ok(!r.out.includes('OUTER_RAN_2'), 'text after a stray quote ran in the outer shell');
  assert.ok(r.out.includes('OUTER_RAN_$((1+1))'), 'inner text was altered: ' + r.out);
});

test('3. bad interval: fails fast', () => {
  const r = runSnippet({ check: 'echo x', baseline: 'x', interval: 'abc' });
  assert.equal(r.status, 0);
  assert.equal(r.out.trim(), 'SENTINEL_FAILED: bad parameter INTERVAL=abc');
  assert.ok(r.ms < 1000, `took ${r.ms} ms`);
});

test('4. command missing', () => {
  const r = runSnippet({ check: 'sentinel_no_such_cmd_xyz', baseline: 'x', limit: '3' });
  assert.equal(r.status, 0);
  assert.ok(
    r.out.startsWith('SENTINEL_FAILED: command missing'),
    'unexpected output: ' + r.out,
  );
});

test('5. three failures across re-arms', () => {
  const r = runSnippet({ check: 'false', baseline: 'x', fails: '2', limit: '3' });
  assert.equal(r.status, 0);
  assert.ok(
    r.out.startsWith('SENTINEL_FAILED: three consecutive non-zero exits'),
    'unexpected output: ' + r.out,
  );
});

test('6. a success resets the failure count before timeout', () => {
  const counter = path.join(TMP, 'counter');
  fs.writeFileSync(counter, '0\n');
  const r = runSnippet({
    check: [
      `cat '${counter}' >/dev/null`,
      `n=$(cat '${counter}'); echo $((n+1)) > '${counter}'`,
      `[ "$n" -ge 1 ] && echo steady`,
    ].join('\n'),
    baseline: 'steady',
    limit: '4',
  });
  assert.equal(r.status, 0);
  assert.equal(lines(r.out).at(-1), 'SENTINEL_TIMEOUT: still unchanged fails=0');
  const calls = Number(fs.readFileSync(counter, 'utf8'));
  assert.ok(calls >= 3, `check ran only ${calls} times, so the first failure was not followed by successes`);
});

test('7. unchanged for the whole limit', () => {
  const r = runSnippet({ check: 'echo same', baseline: 'same', limit: '3' });
  assert.equal(r.status, 0);
  assert.equal(r.out.trim(), 'SENTINEL_TIMEOUT: still unchanged fails=0');
});
