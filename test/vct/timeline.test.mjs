import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimeline } from '../../scripts/vct/lib/timeline.mjs';

const game = (n, map, start, duration = '40:00', id = 'VIDEO000001') => ({ n, map, duration, vod: { id, start } });
const summary = (games) => games.map((g) => [g.n, g.map, g.vod.start, Boolean(g.vod.estimated)]);

test('マップの順番どおりなら何も変えない', () => {
  const games = [game(1, 'ascent', 174), game(2, 'haven', 2387), game(3, 'lotus', 4780)];
  assert.deepEqual(summary(normalizeTimeline(games)), [
    [1, 'ascent', 174, false],
    [2, 'haven', 2387, false],
    [3, 'lotus', 4780, false],
  ]);
});

test('1 本の動画に全マップが入っていて順番が開始秒と食い違うときは、開始秒の順に MAP 番号を振り直す', () => {
  const games = [game(1, 'corrode', 2561), game(2, 'split', 4865), game(3, 'abyss', 5)];
  assert.deepEqual(summary(normalizeTimeline(games)), [
    [1, 'abyss', 5, false],
    [2, 'corrode', 2561, false],
    [3, 'split', 4865, false],
  ]);
});

test('マップごとに別の動画なら番号は振り直さない', () => {
  const games = [game(1, 'ascent', 300, '40:00', 'VIDEO000001'), game(2, 'haven', 90, '40:00', 'VIDEO000002')];
  assert.deepEqual(summary(normalizeTimeline(games)), [
    [1, 'ascent', 300, false],
    [2, 'haven', 90, false],
  ]);
});

test('同じ動画で開始秒が重複していたら、どちらも推定にし、後のマップは前のマップの時間 + 5 分の位置にずらす', () => {
  const games = [game(1, 'sunset', 7709, '38:55'), game(2, 'lotus', 7709, '1:04:51')];
  assert.deepEqual(summary(normalizeTimeline(games)), [
    [1, 'sunset', 7709, true],
    [2, 'lotus', 7709 + 38 * 60 + 55 + 300, true],
  ]);
});

test('overrides で開始秒を直せる（推定ではなくなる）', () => {
  const games = [game(1, 'sunset', 7709), game(2, 'lotus', 7709)];
  const out = normalizeTimeline(games, { 2: { start: 10500 } });
  assert.deepEqual(summary(out), [
    [1, 'sunset', 7709, false],
    [2, 'lotus', 10500, false],
  ]);
});

test('元の配列は書き換えない', () => {
  const games = [game(1, 'corrode', 2561), game(2, 'abyss', 5)];
  normalizeTimeline(games);
  assert.deepEqual(summary(games), [
    [1, 'corrode', 2561, false],
    [2, 'abyss', 5, false],
  ]);
});

test('3 マップとも開始秒が同じでも、順にずらす', () => {
  const games = [game(1, 'sunset', 100, '40:00'), game(2, 'lotus', 100, '30:00'), game(3, 'split', 100, '-')];
  assert.deepEqual(summary(normalizeTimeline(games)), [
    [1, 'sunset', 100, true],
    [2, 'lotus', 100 + 2400 + 300, true],
    [3, 'split', 100 + 2400 + 300 + 1800 + 300, true],
  ]);
});
