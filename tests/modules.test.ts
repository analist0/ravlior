import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MODULES, defaultModuleState, moduleForPath, validateToggle } from '../src/modules/manifest.ts';
import { ROLES } from '../src/shared/types.ts';

// Module contract test — every module (including new ones) must pass this.
test('module manifests satisfy the contract', () => {
  const ids = new Set<string>();
  for (const m of MODULES) {
    assert.match(m.id, /^[a-z][a-z0-9-]{1,40}$/, m.id);
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`);
    ids.add(m.id);
    assert.match(m.version, /^\d+\.\d+\.\d+$/);
    assert.equal(m.featureFlag, `module.${m.id}`);
    for (const r of m.routes) assert.ok(r.startsWith('/'), r);
    for (const p of m.permissions) for (const role of p.roles) assert.ok(ROLES.includes(role), role);
    for (const f of m.migrations) assert.ok(existsSync(new URL(`../supabase/migrations/${f}`, import.meta.url)), `missing migration ${f}`);
    for (const s of m.settings) assert.equal(typeof s.default, s.type === 'number' ? 'number' : s.type === 'boolean' ? 'boolean' : 'string');
  }
  for (const m of MODULES) for (const d of m.dependsOn) assert.ok(ids.has(d), `${m.id} depends on unknown ${d}`);
  // acyclic
  const visit = (id: string, path: string[]): void => {
    assert.ok(!path.includes(id), `cycle: ${[...path, id].join(' → ')}`);
    for (const d of MODULES.find((m) => m.id === id)!.dependsOn) visit(d, [...path, id]);
  };
  for (const m of MODULES) visit(m.id, []);
});

test('toggle validation: core cannot be disabled; dependencies enforced', () => {
  const s = defaultModuleState();
  assert.match(validateToggle('library', false, s)!, /ליבה/);
  assert.match(validateToggle('media', false, s)!, /ליבה/);
  assert.equal(validateToggle('parasha-shelf', true, s), null);
  assert.match(validateToggle('parasha-shelf', true, { ...s, library: false })!, /יש להפעיל/);
  assert.match(validateToggle('library', false, { ...s })!, /./);
  assert.equal(validateToggle('books', false, s), null);
  assert.equal(moduleForPath('/parasha')?.id, 'parasha-shelf');
  assert.equal(moduleForPath('/responsa/abc')?.id, 'responsa');
});
