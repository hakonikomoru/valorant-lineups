import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createParser, parseEventMatches } from '../../scripts/vct/lib/vlr.mjs';

const meta = JSON.parse(await readFile(new URL('../../data/meta.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('fixtures/match.html', import.meta.url), 'utf8');
const PATH = '/753455/team-liquid-vs-paper-rex-valorant-champions-2026-opening-c';

test('試合の大会・日時・チーム・シリーズのスコアを読む', () => {
  const m = createParser(meta).parseMatch(html, PATH);
  assert.equal(m.id, '753455');
  assert.equal(m.event, 'Valorant Champions 2026');
  assert.equal(m.series, 'Group Stage: Opening (C)');
  assert.equal(m.date, '2026-09-24T05:00:00Z');
  assert.equal(m.patch, '13.05');
  assert.equal(m.bestOf, 'Bo3');
  assert.deepEqual(
    m.teams.map((t) => [t.name, t.vlr, t.logo, t.score]),
    [
      ['Team Liquid', '/team/474/team-liquid', 'https://owcdn.net/img/640c381f0603f.png', 1],
      ['Paper Rex', '/team/624/paper-rex', 'https://owcdn.net/img/62bbeba74d5cb.png', 2],
    ],
  );
});

test('マップごとのスコア・ピック・時間を読む（「all」のタブは数えない）', () => {
  const m = createParser(meta).parseMatch(html, PATH);
  assert.deepEqual(
    m.games.map((g) => [g.n, g.map, g.score, g.pick, g.duration]),
    [
      [1, 'ascent', [4, 13], 1, '38:12'],
      [2, 'haven', [13, 7], 0, '39:10'],
      [3, 'lotus', [10, 13], null, '50:01'],
    ],
  );
});

test('1 本の動画に複数マップが入っているとき、マップごとの開始秒を割り当てる（Twitch は使わない）', () => {
  const m = createParser(meta).parseMatch(html, PATH);
  assert.deepEqual(
    m.games.map((g) => g.vod),
    [
      { id: 'lfZ3nXSWT5g', start: 174 },
      { id: 'lfZ3nXSWT5g', start: 2387 },
      { id: 'lfZ3nXSWT5g', start: 4780 },
    ],
  );
});

test('チームごとの構成（選手・所属・エージェント）を読む', () => {
  const parser = createParser(meta);
  const [g] = parser.parseMatch(html, PATH).games;
  assert.deepEqual(g.players[0].map((p) => p.agent), ['sova', 'cypher', 'omen', 'jett', 'phoenix']);
  assert.deepEqual(g.players[1].map((p) => `${p.tag} ${p.name}`), ['PRX something', 'PRX d4v41', 'PRX Jinggg', 'PRX f0rsakeN', 'PRX invy']);
  assert.equal(g.players[1][4].agent, 'kayo');
  assert.equal(parser.unknown.size, 0);
});

test('知らないマップ名は unknown に入れる', () => {
  const parser = createParser(meta);
  parser.parseMatch(html.replaceAll('Lotus', 'Newmap'), PATH);
  assert.deepEqual([...parser.unknown], ['map:Newmap']);
});

test('大会の試合一覧から、試合ページの URL と終了済みかを読む', () => {
  const list = parseEventMatches(`
    <a href="/111111/a-vs-b" class="wf-module-item match-item mod-color"><div class="ml-status">Completed</div></a>
    <a href="/222222/c-vs-d" class="wf-module-item match-item"><div class="ml-status">Upcoming</div></a>
    <a href="/111111/a-vs-b" class="wf-module-item match-item"><div class="ml-status">Completed</div></a>`);
  assert.deepEqual(list, [
    { path: '/111111/a-vs-b', done: true },
    { path: '/222222/c-vs-d', done: false },
  ]);
});
