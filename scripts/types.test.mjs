import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PRIMITIVES, TYPE_KEYS, CORE_STATE_FIELDS, PLUGIN_CATALOG, PROJECT_CATALOG,
  findSlots, checkEntryShape, checkEntryPurity, checkPhaseEntry, loadCatalog, mergeCatalogs,
  loadRegistry, resolveField, resolvePath, instantiate, isInstantiationOf, writeProjectEntries,
  inLinkedWorktree,
} from './types.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'types.mjs');

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const clone = (v) => JSON.parse(JSON.stringify(v));
const SHIPPED = JSON.parse(fs.readFileSync(PLUGIN_CATALOG, 'utf8'));

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'types-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const codes = (errors) => errors.map((e) => e.code);

// The shipped parameterized phase entry, completed.
const phaseDone = (values = ['feat', 'fix', 'chore', 'maintenance']) => ({ ...clone(SHIPPED.phase), values });

// A tiny plugin catalog: one plain entry, one parameterized entry.
const MINI_PLUGIN = () => ({
  plain: { type: 'string', default: '' },
  phase: { type: 'string', values: '{{phase_values}}', nullable: true, default: null },
});

const regOf = (plugin, project = {}) => mergeCatalogs(plugin, project).registry;

function run(args, cwd) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
  assert.ok(r.stdout.endsWith('\n'), 'stdout ends with a newline');
  // JSON.parse over the whole of stdout proves it holds exactly one JSON value.
  const out = JSON.parse(r.stdout);
  assert.equal(typeof out, 'object');
  assert.equal(typeof out.ok, 'boolean');
  return { status: r.status, out };
}

// A writer sandbox: the shipped plugin catalog plus a project catalog path inside a tmp dir.
function sandbox(t) {
  const dir = tmp(t);
  return { dir, projectPath: path.join(dir, '.harness', 'types.json') };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('vocabulary constants', () => {
  assert.deepEqual([...PRIMITIVES], ['string', 'integer', 'number', 'boolean', 'object', 'list', 'command', 'evidence-ref', 'pointer']);
  assert.deepEqual([...TYPE_KEYS], ['type', 'values', 'nullable', 'default', 'items', 'fields']);
  assert.ok(CORE_STATE_FIELDS.includes('phase'));
  assert.ok(CORE_STATE_FIELDS.includes('current_node'));
  assert.equal(PROJECT_CATALOG, path.join('.harness', 'types.json'));
  assert.ok(path.isAbsolute(PLUGIN_CATALOG));
  assert.ok(PLUGIN_CATALOG.endsWith(path.join('skills', 'graph-init', 'templates', 'types.json')));
});

test('work-unit.mjs takes its core field names from CORE_STATE_FIELDS, with no second list', () => {
  const src = fs.readFileSync(path.join(path.dirname(SCRIPT), 'work-unit.mjs'), 'utf8');
  assert.match(src, /import\s*\{[^}]*\bCORE_STATE_FIELDS\b[^}]*\}\s*from\s*'\.\/types\.mjs'/);
  // no hand-kept copy of the core names that could drift from the shared list
  assert.doesNotMatch(src, /const CORE_FIELDS\s*=\s*\[/);
  assert.doesNotMatch(src, /'blocked_at',\s*'fail_counters'/);
  // the pipeline position is core state (design D9)
  assert.ok(CORE_STATE_FIELDS.includes('current_task'));
});

// ---------------------------------------------------------------------------
// findSlots
// ---------------------------------------------------------------------------

test('findSlots finds placeholders anywhere in a JSON value with their paths', () => {
  const found = findSlots({
    type: 'string',
    values: '{{phase_values}}',
    items: { fields: { a: { default: 'x-{{prefix}}-y' } }, list: ['{{ spaced }}', 1, null] },
  });
  assert.deepEqual(found, [
    { slot: 'phase_values', path: 'values' },
    { slot: 'prefix', path: 'items.fields.a.default' },
    { slot: 'spaced', path: 'items.list[0]' },
  ]);
  assert.deepEqual(findSlots({ type: 'string', default: '' }), []);
  assert.deepEqual(findSlots(7), []);
});

// ---------------------------------------------------------------------------
// The shipped plugin catalog and loadRegistry
// ---------------------------------------------------------------------------

test('the shipped plugin catalog loads with no errors and phase is parameterized', (t) => {
  const dir = tmp(t);
  const { registry, errors } = loadRegistry({ projectPath: path.join(dir, 'absent', 'types.json') });
  assert.deepEqual(errors, []);
  assert.deepEqual([...registry.keys()], ['phase', 'contract_ref', 'tickets', 'current_ticket', 'pending_tickets']);
  const phase = registry.get('phase');
  assert.equal(phase.parameterized, true);
  assert.equal(phase.source, 'plugin');
  assert.deepEqual(phase.slots, ['phase_values']);
  for (const name of ['contract_ref', 'tickets', 'current_ticket', 'pending_tickets']) {
    assert.equal(registry.get(name).parameterized, false, name);
    assert.deepEqual(registry.get(name).slots, [], name);
  }
});

test('loadRegistry never writes: no project catalog or directory appears', (t) => {
  const dir = tmp(t);
  const projectPath = path.join(dir, '.harness', 'types.json');
  loadRegistry({ projectPath });
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('loadRegistry reports a missing plugin catalog and unreadable project JSON', (t) => {
  const dir = tmp(t);
  const bad = path.join(dir, 'project.json');
  fs.writeFileSync(bad, '{ nope');
  const r1 = loadRegistry({ pluginPath: path.join(dir, 'missing.json'), projectPath: bad });
  assert.deepEqual(codes(r1.errors).sort(), ['CATALOG_INVALID_JSON', 'CATALOG_UNREADABLE']);
});

// ---------------------------------------------------------------------------
// loadCatalog
// ---------------------------------------------------------------------------

test('loadCatalog: missing optional file is an empty catalog, missing required file is an error', (t) => {
  const dir = tmp(t);
  const file = path.join(dir, 'nope.json');
  assert.deepEqual(loadCatalog(file, { required: false }), { catalog: {}, errors: [] });
  assert.deepEqual(loadCatalog(file), { catalog: {}, errors: [] });
  const req = loadCatalog(file, { required: true });
  assert.equal(req.catalog, null);
  assert.deepEqual(codes(req.errors), ['CATALOG_UNREADABLE']);
});

test('loadCatalog: unreadable path, invalid JSON, and non-object JSON', (t) => {
  const dir = tmp(t);
  assert.deepEqual(codes(loadCatalog(dir).errors), ['CATALOG_UNREADABLE']); // a directory
  const badJson = path.join(dir, 'bad.json');
  fs.writeFileSync(badJson, '{ "a": ');
  assert.deepEqual(codes(loadCatalog(badJson).errors), ['CATALOG_INVALID_JSON']);
  const arr = writeJson(path.join(dir, 'arr.json'), [1]);
  assert.deepEqual(codes(loadCatalog(arr).errors), ['CATALOG_NOT_OBJECT']);
  const ok = writeJson(path.join(dir, 'ok.json'), { a: 1 });
  assert.deepEqual(loadCatalog(ok), { catalog: { a: 1 }, errors: [] });
});

// ---------------------------------------------------------------------------
// resolveField / resolvePath
// ---------------------------------------------------------------------------

test('resolveField: plugin field, dangling reference', () => {
  const { registry } = loadRegistry({ projectPath: '/nonexistent-dir/types.json' });
  const ok = resolveField(registry, 'contract_ref');
  assert.equal(ok.ok, true);
  assert.equal(ok.source, 'plugin');
  assert.equal(ok.entry.type, 'object');
  const dangling = resolveField(registry, 'nope');
  assert.equal(dangling.ok, false);
  assert.equal(dangling.code, 'TYPE_DANGLING');
  assert.match(dangling.message, /nope/);
});

test('resolveField: an unfilled parameterized entry points at the graph-init instantiation step', () => {
  const { registry } = loadRegistry({ projectPath: '/nonexistent-dir/types.json' });
  const r = resolveField(registry, 'phase');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'TYPE_PARAMETERIZED_UNFILLED');
  assert.match(r.message, /graph-init/);
  assert.match(r.message, /\{\{phase_values\}\}/);
});

test('resolveField: after instantiation in a project catalog the project entry resolves', (t) => {
  const dir = tmp(t);
  const projectPath = writeJson(path.join(dir, 'types.json'), { phase: phaseDone() });
  const { registry, errors } = loadRegistry({ projectPath });
  assert.deepEqual(errors, []);
  const r = resolveField(registry, 'phase');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'project');
  assert.deepEqual(r.entry.values, ['feat', 'fix', 'chore', 'maintenance']);
  assert.equal(registry.get('phase').parameterized, false);
});

test('resolvePath walks list items and object fields', () => {
  const { registry } = loadRegistry({ projectPath: '/nonexistent-dir/types.json' });
  const cmd = resolvePath(registry, 'tickets.verification_command');
  assert.equal(cmd.ok, true);
  assert.equal(cmd.entry.type, 'command');
  assert.equal(cmd.source, 'plugin');
  assert.deepEqual(resolvePath(registry, 'tickets.status').entry.values, ['pending', 'in-progress', 'passed', 'failed', 'blocked']);
  assert.equal(resolvePath(registry, 'tickets').entry.type, 'list');
  assert.equal(resolvePath(registry, 'tickets.evidence_refs').entry.type, 'list');
  assert.equal(resolvePath(registry, 'contract_ref.kind').entry.type, 'string');
  assert.equal(resolvePath(registry, 'contract_ref').entry.type, 'object');
});

test('resolvePath walks nested lists and returns the first segment source', () => {
  const plugin = { grid: { type: 'list', default: [], items: { type: 'list', items: { type: 'object', fields: { cell: { type: 'integer' } } } } } };
  const r = resolvePath(regOf(plugin), 'grid.cell');
  assert.equal(r.ok, true);
  assert.equal(r.entry.type, 'integer');
});

test('resolvePath: invalid paths and unresolved heads', () => {
  const { registry } = loadRegistry({ projectPath: '/nonexistent-dir/types.json' });
  for (const p of ['contract_ref.nope', 'tickets.nope', 'current_ticket.x', 'pending_tickets.x', 'tickets.status.extra', 'tickets.', '', '.tickets', 'tickets..id']) {
    const r = resolvePath(registry, p);
    assert.equal(r.ok, false, p);
    assert.equal(r.code, 'TYPE_PATH_INVALID', p);
  }
  assert.equal(resolvePath(registry, 42).code, 'TYPE_PATH_INVALID');
  assert.equal(resolvePath(registry, 'nope.x').code, 'TYPE_DANGLING');
  assert.equal(resolvePath(registry, 'phase.x').code, 'TYPE_PARAMETERIZED_UNFILLED');
});

test('resolvePath: a list with no items cannot be walked into', () => {
  const r = resolvePath(regOf({ bag: { type: 'list', default: [] } }), 'bag.x');
  assert.equal(r.code, 'TYPE_PATH_INVALID');
});

// ---------------------------------------------------------------------------
// mergeCatalogs
// ---------------------------------------------------------------------------

test('mergeCatalogs: an illegal collision names the key and both sources', () => {
  const plugin = { tickets: { type: 'list', default: [] } };
  const project = { tickets: { type: 'list', default: [], items: { type: 'string' } } };
  const { registry, errors } = mergeCatalogs(plugin, project, { pluginSource: 'plugin-file.json', projectSource: 'project-file.json' });
  assert.deepEqual(codes(errors), ['TYPE_COLLISION']);
  assert.equal(errors[0].key, 'tickets');
  assert.deepEqual(errors[0].sources, ['plugin-file.json', 'project-file.json']);
  assert.match(errors[0].message, /tickets/);
  assert.match(errors[0].message, /plugin-file\.json/);
  assert.match(errors[0].message, /project-file\.json/);
  assert.equal(registry.get('tickets').source, 'plugin', 'the plugin entry is kept');
});

test('mergeCatalogs: a parameterized plugin entry may be overridden by an instantiation', () => {
  const { registry, errors } = mergeCatalogs(MINI_PLUGIN(), { phase: phaseDone() });
  assert.deepEqual(errors, []);
  const rec = registry.get('phase');
  assert.equal(rec.source, 'project');
  assert.equal(rec.parameterized, false);
  assert.deepEqual(rec.slots, []);
  assert.equal(registry.get('plain').source, 'plugin');
});

test('mergeCatalogs: an uninstantiated parameterized entry stays registered, marked parameterized', () => {
  const { registry, errors } = mergeCatalogs(MINI_PLUGIN(), {});
  assert.deepEqual(errors, []);
  assert.equal(registry.get('phase').parameterized, true);
});

test('mergeCatalogs: a project-only entry is registered with source project', () => {
  const { registry, errors } = mergeCatalogs({}, { extra: { type: 'integer', default: 0 } });
  assert.deepEqual(errors, []);
  assert.equal(registry.get('extra').source, 'project');
});

test('mergeCatalogs: a slot in the project catalog is rejected', () => {
  const project = { phase: { type: 'string', values: '{{phase_values}}', nullable: true, default: null } };
  const { registry, errors } = mergeCatalogs(MINI_PLUGIN(), project, { projectSource: 'proj.json' });
  assert.deepEqual(codes(errors), ['TYPE_SLOT_IN_PROJECT']);
  assert.equal(errors[0].field, 'phase');
  assert.equal(errors[0].slot, 'phase_values');
  assert.equal(errors[0].source, 'proj.json');
  assert.equal(registry.get('phase').parameterized, true, 'the slot-carrying project entry is not registered');
});

test('mergeCatalogs: shape errors are reported with their source', () => {
  const plugin = { broken: { type: 'bogus', default: null } };
  const project = { alsoBroken: { type: 'string' } };
  const { errors } = mergeCatalogs(plugin, project, { pluginSource: 'P', projectSource: 'Q' });
  assert.deepEqual(errors.map((e) => [e.code, e.field, e.source]), [
    ['TYPE_ENTRY_INVALID', 'broken', 'P'],
    ['TYPE_ENTRY_INVALID', 'alsoBroken', 'Q'],
  ]);
});

test('mergeCatalogs does not check purity (enforced only by the writer)', () => {
  const { errors } = mergeCatalogs({}, { sneaky: { type: 'command', default: null, nullable: true, executes: 'build' } });
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// checkEntryShape
// ---------------------------------------------------------------------------

const shape = (entry, opts) => checkEntryShape('f', entry, opts);

test('checkEntryShape accepts every shipped entry', () => {
  for (const [name, entry] of Object.entries(SHIPPED)) {
    assert.deepEqual(checkEntryShape(name, entry), [], name);
  }
});

test('checkEntryShape: a bad or missing type', () => {
  const e = shape({ type: 'bogus', default: null, nullable: true });
  assert.deepEqual(codes(e), ['TYPE_ENTRY_INVALID']);
  assert.equal(e[0].field, 'f');
  assert.match(e[0].message, /"type"/);
  assert.deepEqual(codes(shape({ default: null, nullable: true })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape('string')), ['TYPE_ENTRY_INVALID']);
  for (const type of PRIMITIVES) {
    const entry = { type, nullable: true, default: null };
    assert.deepEqual(shape(entry), [], type);
  }
});

test('checkEntryShape: values must be a non-empty array of valid values or one placeholder', () => {
  assert.deepEqual(codes(shape({ type: 'string', values: [], default: 'a' })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'string', values: 'a,b', default: 'a' })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'string', values: 'x {{slot}}', default: 'a' })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'string', values: { a: 1 }, default: 'a' })), ['TYPE_ENTRY_INVALID']);
  const wrong = shape({ type: 'integer', values: [1, 'two'], default: 1 });
  assert.deepEqual(codes(wrong), ['TYPE_ENTRY_INVALID']);
  assert.match(wrong[0].message, /"two"/);
  assert.deepEqual(shape({ type: 'string', values: ['a', 'b'], default: 'a' }), []);
  assert.deepEqual(shape({ type: 'string', values: '{{slot}}', default: null, nullable: true }), []);
  assert.deepEqual(shape({ type: 'string', values: ['a', null], nullable: true, default: null }), []);
  assert.deepEqual(codes(shape({ type: 'string', values: ['a', null], default: 'a' })), ['TYPE_ENTRY_INVALID'], 'null in values needs nullable');
});

test('checkEntryShape: nullable must be a boolean', () => {
  assert.deepEqual(codes(shape({ type: 'string', nullable: 'yes', default: 'a' })), ['TYPE_ENTRY_INVALID']);
});

test('checkEntryShape: default must conform to type, values, and nullable', () => {
  assert.deepEqual(codes(shape({ type: 'string', default: 5 })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'integer', default: 1.5 })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'boolean', default: 'true' })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'list', default: {} })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'object', default: [] })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'string', default: null })), ['TYPE_ENTRY_INVALID'], 'null needs nullable');
  assert.deepEqual(codes(shape({ type: 'string', values: ['a', 'b'], default: 'c' })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'command', default: '' })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'evidence-ref', default: { kind: 'path' } })), ['TYPE_ENTRY_INVALID']);
  const listDefault = { type: 'list', items: { type: 'string' } };
  assert.deepEqual(codes(shape({ ...listDefault, default: ['a', 2] })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(shape({ ...listDefault, default: ['a'] }), []);
  assert.deepEqual(shape({ type: 'evidence-ref', default: { kind: 'path', ref: 'a.md' } }), []);
  assert.match(shape({ type: 'string', default: 5 })[0].message, /default/);
});

test('checkEntryShape: the default-vs-values check is skipped when values is a placeholder', () => {
  assert.deepEqual(shape({ type: 'string', values: '{{slot}}', default: 'anything' }), []);
});

test('checkEntryShape: items only on list, fields only on object', () => {
  const items = shape({ type: 'string', items: { type: 'string' }, default: 'a' });
  assert.deepEqual(codes(items), ['TYPE_ENTRY_INVALID']);
  assert.match(items[0].message, /items/);
  const fields = shape({ type: 'list', fields: { a: { type: 'string' } }, default: [] });
  assert.deepEqual(codes(fields), ['TYPE_ENTRY_INVALID']);
  assert.match(fields[0].message, /fields/);
  assert.deepEqual(codes(shape({ type: 'object', fields: ['a'], default: {} })), ['TYPE_ENTRY_INVALID']);
  assert.deepEqual(codes(shape({ type: 'list', items: 'string', default: [] })), ['TYPE_ENTRY_INVALID']);
});

test('checkEntryShape: a missing default is an error at the top level only', () => {
  const top = shape({ type: 'string' });
  assert.deepEqual(codes(top), ['TYPE_ENTRY_INVALID']);
  assert.match(top[0].message, /default/);
  assert.deepEqual(shape({ type: 'string' }, { top: false }), []);
  const nested = { type: 'object', default: null, nullable: true, fields: { a: { type: 'string' }, b: { type: 'list', items: { type: 'integer' } } } };
  assert.deepEqual(shape(nested), [], 'nested entries need no default');
});

test('checkEntryShape: nested errors carry the path inside the entry', () => {
  const entry = {
    type: 'list',
    default: [],
    items: { type: 'object', fields: { id: { type: 'string' }, status: { type: 'string', values: [] }, n: { type: 'integer', default: 'x' } } },
  };
  const errs = shape(entry);
  assert.deepEqual(errs.map((e) => e.path), ['items.fields.status', 'items.fields.n']);
  assert.ok(errs.every((e) => e.field === 'f' && e.code === 'TYPE_ENTRY_INVALID'));
});

test('checkEntryShape does not reject unknown keys (purity is the writer\'s job)', () => {
  assert.deepEqual(shape({ type: 'command', nullable: true, default: null, executes: 'build', scope_kind: 'x' }), []);
});

// ---------------------------------------------------------------------------
// checkEntryPurity
// ---------------------------------------------------------------------------

test('checkEntryPurity: a clean entry has no errors', () => {
  for (const [name, entry] of Object.entries(SHIPPED)) assert.deepEqual(checkEntryPurity(name, entry), [], name);
});

test('checkEntryPurity: top-level executes and scope_kind name the entry and the key', () => {
  const errs = checkEntryPurity('cmd', { type: 'command', nullable: true, default: null, executes: 'build', scope_kind: 'ticket' });
  assert.deepEqual(errs.map((e) => [e.code, e.field, e.key, e.path]), [
    ['TYPE_ENTRY_IMPURE', 'cmd', 'executes', 'executes'],
    ['TYPE_ENTRY_IMPURE', 'cmd', 'scope_kind', 'scope_kind'],
  ]);
  assert.match(errs[0].message, /cmd/);
  assert.match(errs[0].message, /executes/);
});

test('checkEntryPurity: offending keys nested inside items and fields are found', () => {
  const entry = {
    type: 'list',
    default: [],
    items: {
      type: 'object',
      scope_kind: 'ticket',
      fields: {
        id: { type: 'string' },
        verification_command: { type: 'command', executes: 'build' },
        evidence_refs: { type: 'list', items: { type: 'evidence-ref', node: 'review' } },
      },
    },
  };
  const errs = checkEntryPurity('tickets', entry);
  assert.deepEqual(errs.map((e) => [e.key, e.path]), [
    ['scope_kind', 'items.scope_kind'],
    ['executes', 'items.fields.verification_command.executes'],
    ['node', 'items.fields.evidence_refs.items.node'],
  ]);
  assert.ok(errs.every((e) => e.field === 'tickets'));
});

test('checkEntryPurity does not treat field names or data as keys', () => {
  // `fields` keys are names; `default` and `values` are data - none are type keys to police.
  const entry = { type: 'object', default: { executes: 'x' }, nullable: false, fields: { executes: { type: 'string' }, scope_kind: { type: 'string' } } };
  assert.deepEqual(checkEntryPurity('o', entry), []);
});

// ---------------------------------------------------------------------------
// instantiate / isInstantiationOf / checkPhaseEntry
// ---------------------------------------------------------------------------

test('instantiate: a whole-string placeholder takes any JSON value', () => {
  const r = instantiate(SHIPPED.phase, { phase_values: ['feat', 'maintenance'] });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entry, { type: 'string', values: ['feat', 'maintenance'], nullable: true, default: null });
  assert.equal(instantiate({ d: '{{x}}' }, { x: null }).entry.d, null);
  assert.deepEqual(instantiate({ d: '{{x}}' }, { x: { a: [1] } }).entry.d, { a: [1] });
  assert.equal(instantiate({ d: '{{x}}' }, { x: 0 }).entry.d, 0);
});

test('instantiate: an embedded placeholder is substituted textually and must be a string', () => {
  const r = instantiate({ default: 'ticket-{{n}}-{{n}}', values: ['{{a}}/{{b}}'] }, { n: 'x', a: 'p', b: 'q' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entry, { default: 'ticket-x-x', values: ['p/q'] });
  const bad = instantiate({ default: 'ticket-{{n}}' }, { n: 5 });
  assert.deepEqual(codes(bad.errors), ['SLOT_VALUE_INVALID']);
  assert.equal(bad.errors[0].slot, 'n');
  assert.equal(bad.entry.default, 'ticket-{{n}}');
});

test('instantiate: a missing slot value is SLOT_UNFILLED naming the slot', () => {
  const r = instantiate(SHIPPED.phase, {});
  assert.deepEqual(codes(r.errors), ['SLOT_UNFILLED']);
  assert.equal(r.errors[0].slot, 'phase_values');
  assert.equal(r.errors[0].path, 'values');
  assert.match(r.errors[0].message, /phase_values/);
  assert.equal(instantiate(SHIPPED.phase).errors[0].code, 'SLOT_UNFILLED');
  assert.equal(instantiate({ v: '{{a}}' }, { a: undefined }).errors[0].code, 'SLOT_UNFILLED');
});

test('instantiate works at any depth and does not mutate its input', () => {
  const tpl = { type: 'list', default: [], items: { type: 'object', fields: { k: { type: 'string', values: '{{ks}}' } } } };
  const before = clone(tpl);
  const slotValues = { ks: ['a', 'b'] };
  const r = instantiate(tpl, slotValues);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entry.items.fields.k.values, ['a', 'b']);
  assert.deepEqual(tpl, before);
  r.entry.items.fields.k.values.push('c');
  assert.deepEqual(slotValues.ks, ['a', 'b'], 'the slot value is copied, not shared');
});

test('isInstantiationOf: faithful instantiations pass, anything else fails', () => {
  const tpl = SHIPPED.phase;
  assert.equal(isInstantiationOf(tpl, phaseDone()), true);
  assert.equal(isInstantiationOf(tpl, instantiate(tpl, { phase_values: ['x'] }).entry), true);
  assert.equal(isInstantiationOf(tpl, { ...phaseDone(), type: 'integer' }), false);
  assert.equal(isInstantiationOf(tpl, { ...phaseDone(), nullable: false }), false);
  assert.equal(isInstantiationOf(tpl, { ...phaseDone(), default: 'feat' }), false);
  assert.equal(isInstantiationOf(tpl, { ...phaseDone(), extra: 1 }), false);
  const { nullable, ...missing } = phaseDone();
  assert.equal(nullable, true);
  assert.equal(isInstantiationOf(tpl, missing), false);
  assert.equal(isInstantiationOf(tpl, phaseDone('{{phase_values}}')), false, 'a slot left in the candidate');
  assert.equal(isInstantiationOf(tpl, phaseDone(['{{x}}'])), false, 'a slot nested in the filled value');
  assert.equal(isInstantiationOf(tpl, null), false);
  assert.equal(isInstantiationOf(tpl, []), false);
});

test('isInstantiationOf: embedded placeholders keep their surrounding text', () => {
  const tpl = { type: 'string', default: 'v-{{n}}.md' };
  assert.equal(isInstantiationOf(tpl, { type: 'string', default: 'v-3.md' }), true);
  assert.equal(isInstantiationOf(tpl, { type: 'string', default: 'w-3.md' }), false);
  assert.equal(isInstantiationOf(tpl, { type: 'string', default: 3 }), false);
  assert.equal(isInstantiationOf({ a: [1, '{{x}}'] }, { a: [1, 'z'] }), true);
  assert.equal(isInstantiationOf({ a: [1, '{{x}}'] }, { a: [2, 'z'] }), false);
  assert.equal(isInstantiationOf({ a: [1, '{{x}}'] }, { a: [1] }), false);
});

test('checkPhaseEntry: instantiated values must contain maintenance', () => {
  assert.deepEqual(checkPhaseEntry(phaseDone()), []);
  const missing = checkPhaseEntry(phaseDone(['feat', 'fix']));
  assert.deepEqual(codes(missing), ['PHASE_MAINTENANCE_MISSING']);
  assert.equal(missing[0].field, 'phase');
  assert.deepEqual(checkPhaseEntry(SHIPPED.phase), [], 'an uninstantiated entry is not judged here');
  assert.deepEqual(codes(checkPhaseEntry({ type: 'string', default: null, nullable: true })), ['PHASE_MAINTENANCE_MISSING']);
  assert.deepEqual(codes(checkPhaseEntry(null)), ['PHASE_MAINTENANCE_MISSING']);
});

// ---------------------------------------------------------------------------
// writeProjectEntries
// ---------------------------------------------------------------------------

test('writer: a faithful instantiated phase is written and resolves from the project source', (t) => {
  const { dir, projectPath } = sandbox(t);
  const res = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath });
  assert.deepEqual(res, { written: ['phase'], file: projectPath });
  assert.deepEqual(readJson(projectPath), { phase: phaseDone() });
  assert.deepEqual(fs.readdirSync(path.dirname(projectPath)), ['types.json'], 'no temp file left behind');
  assert.ok(fs.readFileSync(projectPath, 'utf8').endsWith('\n'));
  const { registry, errors } = loadRegistry({ projectPath });
  assert.deepEqual(errors, []);
  const r = resolveField(registry, 'phase');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'project');
  assert.deepEqual(fs.readdirSync(dir), ['.harness']);
});

test('writer: a new project entry merges with existing entries; a same-key entry is replaced', (t) => {
  const { projectPath } = sandbox(t);
  writeJson(projectPath, {
    alpha: { type: 'string', default: 'a' },
    beta: { type: 'integer', default: 1 },
  });
  const res = writeProjectEntries({
    entries: { beta: { type: 'integer', default: 2 }, gamma: { type: 'list', default: [], items: { type: 'pointer' } }, phase: phaseDone() },
    projectPath,
  });
  assert.deepEqual(res.written, ['beta', 'gamma', 'phase']);
  const after = readJson(projectPath);
  assert.deepEqual(Object.keys(after), ['alpha', 'beta', 'gamma', 'phase']);
  assert.deepEqual(after.alpha, { type: 'string', default: 'a' }, 'other entries kept');
  assert.deepEqual(after.beta, { type: 'integer', default: 2 }, 'same-key entry replaced');
});

test('writer: an entry with a mechanism field is rejected naming the entry and key, at any depth', (t) => {
  const { projectPath } = sandbox(t);
  const res = writeProjectEntries({
    entries: {
      cmd: { type: 'command', nullable: true, default: null, executes: 'build' },
      rows: { type: 'list', default: [], items: { type: 'object', scope_kind: 'row', fields: { id: { type: 'string', executes: 'x' } } } },
    },
    projectPath,
  });
  assert.equal(res.written, undefined);
  const impure = res.errors.filter((e) => e.code === 'TYPE_ENTRY_IMPURE');
  assert.deepEqual(impure.map((e) => [e.field, e.key, e.path]), [
    ['cmd', 'executes', 'executes'],
    ['rows', 'scope_kind', 'items.scope_kind'],
    ['rows', 'executes', 'items.fields.id.executes'],
  ]);
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: core field names are rejected, except phase', (t) => {
  const { projectPath } = sandbox(t);
  for (const name of ['current_node', 'id', 'outcome', 'fail_counters']) {
    const res = writeProjectEntries({ entries: { [name]: { type: 'string', default: 'x' } }, projectPath });
    assert.deepEqual(codes(res.errors), ['TYPE_CORE_COLLISION'], name);
    assert.equal(res.errors[0].field, name);
  }
  const ok = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath });
  assert.deepEqual(ok.written, ['phase']);
});

test('writer: field names must be lowercase snake_case', (t) => {
  const { projectPath } = sandbox(t);
  for (const name of ['Bad', 'bad-name', '1bad', '_bad', 'bad name', 'bad.name']) {
    const res = writeProjectEntries({ entries: { [name]: { type: 'string', default: 'x' } }, projectPath });
    assert.deepEqual(codes(res.errors), ['TYPE_NAME_INVALID'], name);
    assert.equal(res.errors[0].field, name);
  }
  assert.equal(fs.existsSync(projectPath), false);
  assert.deepEqual(writeProjectEntries({ entries: { good_name_2: { type: 'string', default: 'x' } }, projectPath }).written, ['good_name_2']);
});

test('writer: shape errors are rejected', (t) => {
  const { projectPath } = sandbox(t);
  const res = writeProjectEntries({ entries: { a: { type: 'bogus', default: null }, b: { type: 'string' }, c: { type: 'string', default: 3 } }, projectPath });
  assert.deepEqual(res.errors.map((e) => [e.code, e.field]), [
    ['TYPE_ENTRY_INVALID', 'a'],
    ['TYPE_ENTRY_INVALID', 'b'],
    ['TYPE_ENTRY_INVALID', 'c'],
  ]);
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: a slot left in a draft is rejected', (t) => {
  const { projectPath } = sandbox(t);
  const phase = { type: 'string', values: '{{phase_values}}', nullable: true, default: null };
  const res = writeProjectEntries({ entries: { phase, other: { type: 'string', default: '{{x}}' } }, projectPath });
  assert.deepEqual(res.errors.map((e) => [e.code, e.field, e.slot]), [
    ['TYPE_SLOT_IN_PROJECT', 'phase', 'phase_values'],
    ['TYPE_SLOT_IN_PROJECT', 'other', 'x'],
  ]);
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: a key the plugin defines without parameters is a collision naming both sources', (t) => {
  const { projectPath } = sandbox(t);
  const res = writeProjectEntries({ entries: { tickets: { type: 'list', default: [] } }, projectPath });
  assert.deepEqual(codes(res.errors), ['TYPE_COLLISION']);
  assert.equal(res.errors[0].key, 'tickets');
  assert.deepEqual(res.errors[0].sources, [PLUGIN_CATALOG, projectPath]);
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: a parameterized key must be a faithful instantiation', (t) => {
  const { projectPath } = sandbox(t);
  const variants = {
    'changed type': { ...phaseDone(), type: 'integer' },
    'changed nullable': { ...phaseDone(), nullable: false },
    'changed default': { ...phaseDone(), default: 'feat' },
    'extra key': { ...phaseDone(), items: { type: 'string' } },
    'dropped key': (() => { const { default: _d, ...rest } = phaseDone(); return rest; })(),
  };
  for (const [label, draft] of Object.entries(variants)) {
    const res = writeProjectEntries({ entries: { phase: draft }, projectPath });
    assert.ok(codes(res.errors).includes('TYPE_INSTANTIATION_MISMATCH'), label);
    assert.equal(res.written, undefined, label);
  }
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: the phase entry must contain maintenance', (t) => {
  const { projectPath } = sandbox(t);
  const res = writeProjectEntries({ entries: { phase: phaseDone(['feat', 'fix']) }, projectPath });
  assert.deepEqual(codes(res.errors), ['PHASE_MAINTENANCE_MISSING']);
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: all-or-nothing - one bad entry writes nothing and leaves an existing catalog byte-identical', (t) => {
  const { projectPath } = sandbox(t);
  writeJson(projectPath, { alpha: { type: 'string', default: 'a' } });
  const before = fs.readFileSync(projectPath);
  const res = writeProjectEntries({
    entries: { phase: phaseDone(), good: { type: 'integer', default: 0 }, bad: { type: 'string', executes: 'x' } },
    projectPath,
  });
  assert.ok(res.errors.length > 0);
  assert.deepEqual(fs.readFileSync(projectPath), before);
  assert.deepEqual(fs.readdirSync(path.dirname(projectPath)), ['types.json'], 'no temp file left behind');
});

test('writer: the would-be catalog is re-checked, so an already-bad project catalog blocks the write', (t) => {
  const { projectPath } = sandbox(t);
  writeJson(projectPath, { tickets: { type: 'list', default: [] } }); // hand-edited collision
  const before = fs.readFileSync(projectPath);
  const res = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath });
  assert.deepEqual(codes(res.errors), ['TYPE_COLLISION']);
  assert.equal(res.errors[0].key, 'tickets');
  assert.deepEqual(fs.readFileSync(projectPath), before);
});

test('writer: an unreadable existing project catalog is an input error and is left untouched', (t) => {
  const { projectPath } = sandbox(t);
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  fs.writeFileSync(projectPath, '{ not json');
  const res = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath });
  assert.deepEqual(codes(res.errors), ['CATALOG_INVALID_JSON']);
  assert.equal(fs.readFileSync(projectPath, 'utf8'), '{ not json');
});

test('writer: a missing plugin catalog is an error; drafts must be non-empty objects', (t) => {
  const { dir, projectPath } = sandbox(t);
  const res = writeProjectEntries({ entries: { a: { type: 'string', default: 'x' } }, projectPath, pluginPath: path.join(dir, 'missing.json') });
  assert.deepEqual(codes(res.errors), ['CATALOG_UNREADABLE']);
  for (const entries of [undefined, null, [], 'x', {}]) {
    assert.deepEqual(codes(writeProjectEntries({ entries, projectPath }).errors), ['DRAFT_INVALID']);
  }
  assert.equal(fs.existsSync(projectPath), false);
});

test('writer: a custom plugin catalog drives collisions and instantiation', (t) => {
  const { dir, projectPath } = sandbox(t);
  const pluginPath = writeJson(path.join(dir, 'plugin.json'), MINI_PLUGIN());
  assert.deepEqual(codes(writeProjectEntries({ entries: { plain: { type: 'string', default: '' } }, projectPath, pluginPath }).errors), ['TYPE_COLLISION']);
  const ok = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath, pluginPath });
  assert.deepEqual(ok.written, ['phase']);
});

// A read-only directory makes the temp-file write fail (not meaningful for root).
const canTestReadOnly = typeof process.getuid === 'function' && process.getuid() !== 0;

test('writer: WRITE_FAILED when the catalog directory is not writable', { skip: !canTestReadOnly }, (t) => {
  const { dir } = sandbox(t);
  const ro = path.join(dir, 'ro');
  fs.mkdirSync(ro);
  fs.chmodSync(ro, 0o555);
  try {
    const res = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath: path.join(ro, 'types.json') });
    assert.deepEqual(codes(res.errors), ['WRITE_FAILED']);
    assert.deepEqual(fs.readdirSync(ro), []);
  } finally {
    fs.chmodSync(ro, 0o755);
  }
});

test('writer: a project catalog path under a regular file is an unreadable catalog', (t) => {
  const { dir } = sandbox(t);
  const blocker = path.join(dir, 'blocker');
  fs.writeFileSync(blocker, 'a file, not a directory');
  const res = writeProjectEntries({ entries: { phase: phaseDone() }, projectPath: path.join(blocker, 'types.json') });
  assert.deepEqual(codes(res.errors), ['CATALOG_UNREADABLE']);
  assert.deepEqual(fs.readdirSync(dir), ['blocker']);
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

test('cli: --help and no arguments print one help object and exit 0', (t) => {
  const dir = tmp(t);
  for (const args of [['--help'], ['-h'], [], ['write', '--help']]) {
    const { status, out } = run(args, dir);
    assert.equal(status, 0, args.join(' '));
    assert.equal(out.ok, true);
    assert.equal(out.command, 'help');
    assert.ok(Array.isArray(out.usage));
    assert.deepEqual(Object.keys(out.exit_codes), ['0', '1', '2', '3', '4', '5', '70']);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('cli: usage errors exit 2', (t) => {
  const dir = tmp(t);
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone() });
  const cases = [
    [['frob'], 'frob'],
    [['--from', draft], null],
    [['write'], 'write'],
    [['write', '--from'], 'write'],
    [['write', '--from', '--project', 'x'], 'write'],
    [['write', '--from', draft, '--bogus'], 'write'],
    [['write', 'stray', '--from', draft], 'write'],
    [['write', '--from', draft, '--from', draft], 'write'],
    [['write', '--from', draft, '--project'], 'write'],
  ];
  for (const [args, command] of cases) {
    const { status, out } = run(args, dir);
    assert.equal(status, 2, args.join(' '));
    assert.equal(out.ok, false);
    assert.equal(out.command, command);
    assert.deepEqual(codes(out.errors), ['USAGE']);
  }
  assert.deepEqual(fs.readdirSync(dir), ['draft.json']);
});

test('cli: unreadable or invalid draft JSON exits 3', (t) => {
  const dir = tmp(t);
  const missing = run(['write', '--from', path.join(dir, 'missing.json')], dir);
  assert.equal(missing.status, 3);
  assert.deepEqual(codes(missing.out.errors), ['INPUT_UNREADABLE']);
  const badFile = path.join(dir, 'bad.json');
  fs.writeFileSync(badFile, '{ "phase": ');
  const bad = run(['write', '--from', badFile], dir);
  assert.equal(bad.status, 3);
  assert.deepEqual(codes(bad.out.errors), ['INPUT_INVALID_JSON']);
  const arrFile = writeJson(path.join(dir, 'arr.json'), [1, 2]);
  const arr = run(['write', '--from', arrFile], dir);
  assert.equal(arr.status, 3);
  assert.deepEqual(codes(arr.out.errors), ['DRAFT_INVALID']);
  assert.equal(fs.existsSync(path.join(dir, '.harness')), false);
});

test('cli: an invalid project or plugin catalog exits 3', (t) => {
  const dir = tmp(t);
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone() });
  const badProject = path.join(dir, 'bad-project.json');
  fs.writeFileSync(badProject, '[1]');
  const a = run(['write', '--from', draft, '--project', badProject], dir);
  assert.equal(a.status, 3);
  assert.deepEqual(codes(a.out.errors), ['CATALOG_NOT_OBJECT']);
  const b = run(['write', '--from', draft, '--project', path.join(dir, 'p.json'), '--plugin', path.join(dir, 'absent.json')], dir);
  assert.equal(b.status, 3);
  assert.deepEqual(codes(b.out.errors), ['CATALOG_UNREADABLE']);
});

test('cli: a rejected draft exits 1 with errors and writes nothing', (t) => {
  const dir = tmp(t);
  const draft = writeJson(path.join(dir, 'draft.json'), {
    phase: phaseDone(['feat']),
    cmd: { type: 'command', nullable: true, default: null, executes: 'build' },
  });
  const { status, out } = run(['write', '--from', draft], dir);
  assert.equal(status, 1);
  assert.equal(out.ok, false);
  assert.equal(out.command, 'write');
  assert.deepEqual(codes(out.errors), ['PHASE_MAINTENANCE_MISSING', 'TYPE_ENTRY_IMPURE']);
  assert.equal(out.errors[1].key, 'executes');
  assert.equal(fs.existsSync(path.join(dir, '.harness')), false);
});

test('cli: success exits 0, writes the default project catalog under the cwd, and resolves afterwards', (t) => {
  const dir = tmp(t);
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone() });
  const { status, out } = run(['write', '--from', draft], dir);
  assert.equal(status, 0);
  assert.deepEqual(out, { ok: true, command: 'write', written: ['phase'], file: path.join('.harness', 'types.json') });
  const file = path.join(dir, '.harness', 'types.json');
  assert.deepEqual(readJson(file), { phase: phaseDone() });
  const { registry, errors } = loadRegistry({ projectPath: file });
  assert.deepEqual(errors, []);
  const r = resolveField(registry, 'phase');
  assert.equal(r.ok, true);
  assert.equal(r.source, 'project');
});

test('cli: --project and --plugin override the defaults', (t) => {
  const dir = tmp(t);
  const pluginPath = writeJson(path.join(dir, 'plugin.json'), MINI_PLUGIN());
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone(), extra: { type: 'integer', default: 0 } });
  const target = path.join(dir, 'out', 'my-types.json');
  const { status, out } = run(['write', '--from', draft, '--project', target, '--plugin', pluginPath], dir);
  assert.equal(status, 0);
  assert.deepEqual(out.written, ['phase', 'extra']);
  assert.equal(out.file, target);
  assert.deepEqual(Object.keys(readJson(target)), ['phase', 'extra']);
});

test('cli: a write failure exits 4', { skip: !canTestReadOnly }, (t) => {
  const dir = tmp(t);
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone() });
  const ro = path.join(dir, 'ro');
  fs.mkdirSync(ro);
  fs.chmodSync(ro, 0o555);
  try {
    const { status, out } = run(['write', '--from', draft, '--project', path.join(ro, 'types.json')], dir);
    assert.equal(status, 4);
    assert.deepEqual(codes(out.errors), ['WRITE_FAILED']);
  } finally {
    fs.chmodSync(ro, 0o755);
  }
});

// ---------------------------------------------------------------------------
// Linked-worktree guard
// ---------------------------------------------------------------------------

function gitRepoWithWorktree(t) {
  const dir = tmp(t);
  const main = path.join(dir, 'main');
  const wt = path.join(dir, 'wt');
  fs.mkdirSync(main, { recursive: true });
  const git = (args, cwd) => {
    const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  };
  git(['init', '-q', '-b', 'main'], main);
  git(['commit', '--allow-empty', '-q', '-m', 'init'], main);
  git(['worktree', 'add', '-q', wt, '-b', 'unit'], main);
  return { dir, main, wt };
}

test('cli: write refuses inside a linked worktree with IN_WORKTREE and writes nothing', (t) => {
  const { dir, wt } = gitRepoWithWorktree(t);
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone() });
  const { status, out } = run(['write', '--from', draft], wt);
  assert.equal(status, 5);
  assert.equal(out.ok, false);
  assert.deepEqual(codes(out.errors), ['IN_WORKTREE']);
  assert.equal(fs.existsSync(path.join(wt, '.harness')), false, 'nothing written in the worktree');
});

test('cli: write succeeds in the main checkout of a repo that has worktrees', (t) => {
  const { dir, main } = gitRepoWithWorktree(t);
  const draft = writeJson(path.join(dir, 'draft.json'), { phase: phaseDone() });
  const { status } = run(['write', '--from', draft], main);
  assert.equal(status, 0);
  assert.deepEqual(readJson(path.join(main, '.harness', 'types.json')), { phase: phaseDone() });
});

test('inLinkedWorktree: false outside any git repository', (t) => {
  assert.equal(inLinkedWorktree(tmp(t)), false);
});
