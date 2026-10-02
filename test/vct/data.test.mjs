// 生成済みの data/vct/matches.json の整合性（サイトでマップの頭出しが正しく動くための前提）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../../data/vct/matches.json', import.meta.url), 'utf8'));
const meta = JSON.parse(await readFile(new URL('../../data/meta.json', import.meta.url), 'utf8'));
const maps = new Set(meta.maps.map((m) => m.slug));

test('すべてのマップに公式チャンネルの VOD がある', () => {
  for (const m of data.matches)
    for (const g of m.games) {
      assert.ok(maps.has(g.map), `${m.id}: ${g.map}`);
      assert.match(g.vod.id, /^[\w-]{11}$/);
      assert.ok(data.channels[g.vod.channel], `${m.id}: ${g.vod.channel}`);
      assert.ok(Number.isInteger(g.vod.start) && g.vod.start >= 0);
    }
});

test('同じ動画に入っている同じ試合のマップは、マップの順に開始秒が増えていく', () => {
  for (const m of data.matches) {
    const byVideo = new Map();
    for (const g of m.games) byVideo.set(g.vod.id, [...(byVideo.get(g.vod.id) ?? []), g]);
    for (const games of byVideo.values()) {
      for (let i = 1; i < games.length; i++) {
        assert.ok(games[i].vod.start > games[i - 1].vod.start, `${m.id}: MAP ${games[i].n} の開始秒が前のマップより前`);
      }
    }
  }
});

test('構成は各チーム 5 人', () => {
  for (const m of data.matches) for (const g of m.games) for (const c of g.comps) assert.equal(c.length, 5, `${m.id} MAP ${g.n}`);
});

test('チームロゴはサイトに保存した画像を指す（vlr.gg の画像は直リンクできない）', async () => {
  const { access } = await import('node:fs/promises');
  for (const [id, t] of Object.entries(data.teams)) {
    if (!t.logo) continue;
    assert.match(t.logo, /^\/assets\/vct\/teams\/[\w-]+\.\w+$/, id);
    await access(new URL(`../..${t.logo}`, import.meta.url));
  }
});
