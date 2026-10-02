import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL, routePath, parsePath } from '../../assets/js/vct/seo.js';

test('マップと大会から URL を作り、URL から戻せる', () => {
  const cases = [
    [{ map: ALL, event: ALL }, '/vct'],
    [{ map: 'ascent', event: ALL }, '/vct/ascent'],
    [{ map: 'ascent', event: 'champions-2026' }, '/vct/ascent/champions-2026'],
    [{ map: ALL, event: 'champions-2026' }, '/vct/all/champions-2026'],
  ];
  for (const [state, path] of cases) {
    assert.equal(routePath(state), path);
    assert.deepEqual(parsePath(path), state);
  }
  assert.deepEqual(parsePath('/vct/'), { map: ALL, event: ALL });
});
