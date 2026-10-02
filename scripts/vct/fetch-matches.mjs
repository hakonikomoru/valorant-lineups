// vlr.gg から VCT の試合（マップごとのスコア・構成・公式 VOD とその開始時刻）を取得し、
// data/vct/sources/vlr/<大会ID>.json に保存する。
// 使い方: node scripts/vct/fetch-matches.mjs [--event 2766] [--refresh]
//   --event   その大会だけ取得する（複数可）。省略時は EVENTS の全大会
//   --refresh 終了済みの試合もキャッシュを使わず取り直す（VOD が後から登録されることがあるため）
//
// - 終了済みでマップごとの VOD がそろった試合は、data/vct/sources/vlr/ に保存済みの内容を使い、次から取りに行かない
//   （取得した HTML は調査用に .cache/vct/vlr/ にも保存する）
// - vlr.gg の負荷にならないよう、同時 2 件・1 件ごとに 600ms 空ける
// - 1 本の動画に複数マップが入っている（FULL MATCH）ときは、vlr.gg の VOD リンクの開始秒（?t=）をマップごとに記録する
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { EVENTS } from './events.mjs';
import { createParser, parseEventMatches } from './lib/vlr.mjs';

const BASE = 'https://www.vlr.gg';
const root = new URL('../../', import.meta.url);
const cacheDir = new URL('.cache/vct/vlr/', root);
const outDir = new URL('data/vct/sources/vlr/', root);
const meta = JSON.parse(await readFile(new URL('data/meta.json', root), 'utf8'));
const CONCURRENCY = 2;
const WAIT_MS = 600;

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const only = args.flatMap((a, i) => (args[i - 1] === '--event' ? [Number(a)] : []));
const events = only.length ? EVENTS.filter((e) => only.includes(e.id)) : EVENTS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; vct-map-archive; +https://github.com/hakonikomoru)' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {}
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`${path}: 取得できません`);
}

// 試合ページを取得する（調査用に .cache/vct/vlr/ にも保存する）
async function getMatchHtml(path) {
  await sleep(WAIT_MS);
  const html = await get(path);
  if (html) await writeFile(new URL(`${path.split('/')[1]}.html`, cacheDir), html);
  return html;
}

const { parseMatch, unknown } = createParser(meta);

// 大会の試合一覧から試合ページの URL を集める
const matchPathsOf = async (event) => parseEventMatches(await get(`/event/matches/${event.id}/?series_id=all`));

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

await mkdir(cacheDir, { recursive: true });
await mkdir(outDir, { recursive: true });

for (const event of events) {
  const outFile = new URL(`${event.id}.json`, outDir);
  const prev = JSON.parse(await readFile(outFile, 'utf8').catch(() => '[]'));
  const prevById = new Map(prev.map((m) => [m.id, m]));
  const list = await matchPathsOf(event);
  let fetched = 0;
  const matches = (
    await pool(list, async ({ path, done }) => {
      if (!done) return null; // 未消化・進行中の試合は載せない
      const old = prevById.get(path.split('/')[1]);
      // 全マップに VOD がそろっていれば取り直さない
      const complete = old && old.games.length && old.games.every((g) => g.vod);
      // 全マップに VOD がそろっていれば、保存済みの内容をそのまま使う（GitHub Actions では .cache が無いため）
      if (complete && !refresh) return old;
      const html = await getMatchHtml(path);
      fetched++;
      if (!html) return null;
      return parseMatch(html, path);
    })
  ).filter((m) => m && m.games.length);
  matches.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(outFile, JSON.stringify(matches, null, 1) + '\n');
  const games = matches.flatMap((m) => m.games);
  console.log(
    `${event.name}: 試合 ${matches.length}（取得 ${fetched}）/ マップ ${games.length} / VOD あり ${games.filter((g) => g.vod).length}`,
  );
}
if (unknown.size) console.warn(`未知の名前: ${[...unknown].join(', ')}（data/meta.json を更新してください）`);
