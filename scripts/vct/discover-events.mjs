// vlr.gg の VCT のページ（今年と来年の https://www.vlr.gg/vct-<年>）から大会を探し、data/vct/sources/events.json に記録する。
// 使い方: node scripts/vct/discover-events.mjs
//
// - scripts/vct/events.mjs に手で書いた大会（名前を整えたもの）はそちらを使い、ここでは書かれていない大会だけを足す
// - 来年のページはシーズンが始まるまで 404 なので、そのときは何もしない
// - 地域リーグ（Kickoff・Stage）・Masters・Champions 以外の大会（Ascension など）は載せない（公式 VOD のチャンネルが違うため）
import { readFile, writeFile } from 'node:fs/promises';
import { EVENTS } from './events.mjs';
import { parseVctPage, eventFromVlr } from './lib/events.mjs';

const path = new URL('../../data/vct/sources/events.json', import.meta.url);
const UA = 'Mozilla/5.0 (compatible; vct-map-archive; +https://github.com/hakonikomoru)';
const known = new Set(EVENTS.map((e) => e.id));
const saved = JSON.parse(await readFile(path, 'utf8').catch(() => '[]'));
const found = new Map(saved.map((e) => [e.id, e]));

const year = new Date().getUTCFullYear();
const skipped = [];
for (const y of [year, year + 1]) {
  const res = await fetch(`https://www.vlr.gg/vct-${y}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (res.status === 404) {
    console.log(`vct-${y}: ページなし（シーズン前）`);
    continue;
  }
  if (!res.ok) throw new Error(`vct-${y}: HTTP ${res.status}`);
  const cards = parseVctPage(await res.text());
  if (!cards.length) throw new Error(`vct-${y}: 大会を読み取れませんでした（vlr.gg のページの形が変わった可能性）`);
  for (const card of cards) {
    const event = eventFromVlr(card, y);
    if (!event) skipped.push(`${card.title}（${card.vlrSlug}）`);
    else if (!known.has(event.id)) found.set(event.id, event);
  }
  console.log(`vct-${y}: 大会 ${cards.length}`);
}

const list = [...found.values()].filter((e) => !known.has(e.id)).sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
await writeFile(path, JSON.stringify(list, null, 2) + '\n');
console.log(`自動で追加した大会: ${list.length}${list.length ? `（${list.map((e) => e.name).join(' / ')}）` : ''}`);
if (skipped.length) console.log(`載せない大会: ${skipped.join(' / ')}`);
