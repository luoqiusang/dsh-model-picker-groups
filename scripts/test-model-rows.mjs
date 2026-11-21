#!/usr/bin/env node
// Dependency-free regression tests against the actual emitted regions and bundle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const region = (text, label) => {
  const start = text.indexOf(`//#region lib/types/client/${label}`);
  assert.notEqual(start, -1, `missing region ${label}`);
  const end = text.indexOf('//#endregion', start);
  assert.notEqual(end, -1, `unterminated region ${label}`);
  return text.slice(start, end);
};
const t = (key, values) => `${key}:${values?.message ?? ''}`;

async function checkRows(label, providerSource, indexSource) {
  const api = new Function('ModelDirectoryResolver', 'ModelSelect', 'zh', 'en',
    '_deepseek_ai_dsh_client_ui_primitives', `${providerSource}\n${indexSource}\nreturn { rowId, optionsOf, selectionOf, apply };`
  )(() => {}, () => {}, {}, {}, {});
  const { rowId, optionsOf, selectionOf } = api;
  const state = {
    current: null,
    groups: [{ id: 'failure', name: 'failure', models: [{ id: 'alpha', name: 'Alpha' }] }],
    failures: [{ id: 'alpha', name: 'alpha', message: 'boom' }]
  };
  const rows = optionsOf(state, t);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id, 'failure must not collide with a model');
  assert.equal(rows[0].id, 'model:failure/alpha');
  assert.equal(rows[1].id, 'failure:alpha', 'failure rows require their own typed namespace');
  assert.equal(selectionOf(state, rows[1].id), undefined);
  assert.deepEqual(selectionOf(state, rows[0].id), { provider: 'failure', model: 'alpha' });
  for (const id of ['', 'failure/alpha', 'unknown:alpha', 'model:missing', null, undefined]) {
    assert.equal(selectionOf(state, id), undefined);
  }

  // Capture the real command contribution, rather than reimplementing its callback.
  let command;
  const selections = [];
  const directory = {
    store: { getSnapshot: () => state },
    load: async () => state,
    select: async (selection) => { selections.push(selection); return { ok: true }; }
  };
  const scope = {
    get: () => ({ register: (spec) => { command = spec; } }),
    modelDirectories: { directoryFor: () => directory },
    sessions: { subagentAddress: () => undefined },
    effect: (fn) => fn()
  };
  api.apply({
    locale: { register: () => {}, bind: () => t },
    effect: (fn) => fn(), plugin: () => {},
    inject: (deps, fn) => { if (deps.includes('commandUi')) fn(scope); }
  });
  const session = { sessionId: 'test-session' };
  assert.deepEqual(await command.ui.options(session), rows);
  await command.ui.onSelect(rows[1], session);
  assert.deepEqual(selections, [], 'failure callback must neither throw nor switch models');
  await command.ui.onSelect(rows[0], session);
  assert.deepEqual(selections, [{ provider: 'failure', model: 'alpha' }]);

  const mergedState = {
    current: { provider: 'route-b', model: 'shared', reasoningEffort: 'high' },
    failures: [],
    groups: ['route-a', 'route-b'].map((id) => ({
      id, name: 'Same Provider',
      models: [{ id: 'shared', name: 'Shared', reasoning: { defaultEffort: 'low' } }]
    }))
  };
  const mergedRows = optionsOf(mergedState, t);
  assert.equal(mergedRows[0].group.name, mergedRows[1].group.name);
  assert.notEqual(mergedRows[0].id, mergedRows[1].id);
  assert.deepEqual(selectionOf(mergedState, mergedRows[0].id), {
    provider: 'route-a', model: 'shared', reasoningEffort: 'low'
  });
  assert.deepEqual(selectionOf(mergedState, mergedRows[1].id), {
    provider: 'route-b', model: 'shared', reasoningEffort: 'high'
  });
  assert.equal(mergedRows[1].active, true);

  // Seeded pseudo-random names make failures reproducible in CI; include '/' and ':'.
  let seed = 0x12345678;
  const randomName = () => Array.from({ length: 12 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 'ab/:09'[seed % 6];
  }).join('');
  const names = ['failure', 'alpha', '/', ':', ...Array.from({ length: 20 }, randomName)];
  const generatedState = {
    current: null,
    groups: names.map((id) => ({ id, name: id, models: names.map((model) => ({ id: model, name: model })) })),
    failures: names.map((id) => ({ id, name: id, message: 'boom' }))
  };
  const generatedRows = optionsOf(generatedState, t);
  const models = new Set(generatedRows.slice(0, names.length ** 2).map((row) => row.id));
  for (const failure of generatedRows.slice(names.length ** 2)) {
    assert.ok(failure.id.startsWith('failure:'));
    assert.ok(!models.has(failure.id));
    assert.equal(selectionOf(generatedState, failure.id), undefined);
    for (const provider of names) for (const model of names) {
      assert.notEqual(failure.id, rowId(provider, model));
    }
  }
  const punctuationState = {
    current: null, failures: [],
    groups: [{ id: 'a:/b', name: 'Punctuation', models: [{ id: 'c:/d', name: 'Punctuation' }] }]
  };
  assert.deepEqual(selectionOf(punctuationState, optionsOf(punctuationState, t)[0].id), {
    provider: 'a:/b', model: 'c:/d'
  });
  console.log(`PASS ${label}: typed row ids, failure callback no-op, merged routes, ${names.length ** 3} generated comparisons`);
}

function checkIme(label, source) {
  const start = source.indexOf('const onRootKeyDown = (event) => {');
  const end = source.indexOf('const onBlur =', start);
  assert.ok(start >= 0 && end > start);
  let chosen = 0;
  let prevented = 0;
  class Input {}
  const handler = new Function('HTMLInputElement', 'open', 'pane', 'showSearch', 'busy',
    'visibleModels', 'activeModelIndex', 'choose',
    `${source.slice(start, end)}\nreturn onRootKeyDown;`
  )(Input, true, 'model', true, false, [{ provider: 'route', model: 'model' }], 0, () => { chosen++; });
  for (const nativeEvent of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
    for (const key of ['Enter', 'Tab']) handler({ nativeEvent, key, target: new Input(), preventDefault: () => { prevented++; } });
  }
  assert.equal(chosen, 0, 'IME confirmation must not select');
  assert.equal(prevented, 0, 'IME confirmation must remain native');
  handler({ nativeEvent: { isComposing: false, keyCode: 13 }, key: 'Enter', target: new Input(), preventDefault: () => { prevented++; } });
  assert.equal(chosen, 1, 'ordinary Enter must still select');
  assert.equal(prevented, 1);
  console.log(`PASS ${label}: composing/keyCode 229 ignore Enter and Tab; normal Enter selects`);
}

try {
  const bundle = read('lib/client.js');
  await checkRows('src', read('src/provider-order.js'), region(read('src/index-region.js'), 'index.js'));
  await checkRows('bundle', region(bundle, 'provider-order.js'), region(bundle, 'index.js'));
  checkIme('src', read('src/ModelSelect.js'));
  checkIme('bundle', region(bundle, 'ModelSelect.js'));
  console.log('TEST PASS');
} catch (error) {
  console.error('TEST FAIL:', error);
  process.exitCode = 1;
}
