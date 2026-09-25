// YouTube Data API で新しい定点動画を探し、data/sources/auto.json に追記する（GitHub Actions で毎日実行）。
// 使い方: YOUTUBE_API_KEY=... node scripts/discover-videos.mjs
//
// - エージェントごとに日本語「<名前> 定点」・英語「<Name> lineups」で、前回の実行以降に公開された動画を検索する
//   （search は 1 回 100 ユニット。無料枠 1 日 10,000 ユニットに収まるよう 1 回の実行で 60 回程度）
// - タイトルに「定点系の語」「エージェント名」「マップ名」がそろうものだけ採用する（マップ名が無ければ見送る）
// - 埋め込み不可・非公開の動画は除外。ショートかどうかは /shorts/ の oEmbed で判定する
import { readdir, readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) {
  console.log('YOUTUBE_API_KEY が無いので新着動画の検索をスキップします。');
  process.exit(0);
}

const root = new URL('../data/', import.meta.url);
const statePath = new URL('discover-state.json', root);
const outPath = new URL('sources/auto.json', root);
const meta = JSON.parse(await readFile(new URL('meta.json', root), 'utf8'));

const LINEUP = /定点|空爆|ラインナップ|セットアップ|ワンウェイ|lineups?\b|line[\s-]ups?\b|setups?\b|one[\s-]?ways?\b|moll(y|ies)\b/i;
const ALL_MAPS = /全マップ|all\s?maps|every\s?map/i;
// API の名前以外の呼び方
const AGENT_ALIASES = {
  brimstone: ['ブリム', 'brim'],
  kayo: ['ケイオー', 'kay/o'],
  killjoy: ['KJ'],
  cypher: ['サイファ'],
  deadlock: ['デドロ'],
};
const MAP_ALIASES = { icebox: ['アイボ'], fracture: ['フラクチャ'], haven: ['ヘイブン'] };

// 英語名は単語として、日本語名はそのまま含まれるかで判定する
const matcher = (names) => {
  const parts = names.map((n) => {
    const e = n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    return /^[\x00-\x7f]+$/.test(n) ? `\\b${e}\\b` : e;
  });
  return new RegExp(parts.join('|'), 'i');
};
const agentRules = meta.agents.map((a) => [a.slug, matcher([a.name, a.nameEn, ...(AGENT_ALIASES[a.slug] ?? [])])]);
const mapRules = meta.maps.map((m) => [m.slug, matcher([m.name, m.nameEn, ...(MAP_ALIASES[m.slug] ?? [])])]);

async function api(path, params) {
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: KEY })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function isShort(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/shorts/${id}`)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) return false;
  const { width, height } = await res.json();
  return height > width;
}

// 既に収録済みの動画
const known = new Set();
for (const f of (await readdir(new URL('sources/', root))).filter((f) => f.endsWith('.json'))) {
  for (const e of JSON.parse(await readFile(new URL(`sources/${f}`, root), 'utf8'))) known.add(e.youtubeId);
}

const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'));
const now = new Date();
// 前回の実行から 1 日重ねて探す（初回は 14 日前から）
const since = new Date(state.lastRun ? Date.parse(state.lastRun) - 86400000 : now - 14 * 86400000);

const queries = meta.agents.flatMap((a) => [
  { q: `${a.name} 定点`, relevanceLanguage: 'ja' },
  { q: `${a.nameEn} lineups valorant`, relevanceLanguage: 'en' },
]);

const found = new Map();
for (const { q, relevanceLanguage } of queries) {
  const data = await api('search', {
    part: 'snippet',
    type: 'video',
    q,
    relevanceLanguage,
    order: 'date',
    maxResults: '50',
    publishedAfter: since.toISOString(),
  });
  for (const item of data.items ?? []) {
    const id = item.id.videoId;
    if (!known.has(id)) found.set(id, true);
  }
}

// 埋め込み可・公開の動画だけ、正式なタイトルで判定する（videos は 50 件で 1 ユニット）
const added = [];
const ids = [...found.keys()];
for (let i = 0; i < ids.length; i += 50) {
  const data = await api('videos', { part: 'snippet,status', id: ids.slice(i, i + 50).join(',') });
  for (const v of data.items ?? []) {
    if (!v.status.embeddable || v.status.privacyStatus !== 'public') continue;
    const { title, channelTitle } = v.snippet;
    if (!LINEUP.test(title)) continue;
    const agents = agentRules.filter(([, re]) => re.test(title)).map(([slug]) => slug);
    if (!agents.length) continue;
    // ハッシュタグだけに出てくるマップ名（#フラクチャー など）は無関係なことが多いので見ない
    const body = title.replace(/#\S+/g, '');
    let maps = mapRules.filter(([, re]) => re.test(body)).map(([slug]) => slug);
    if (ALL_MAPS.test(title) || maps.length > 3) maps = ['all'];
    if (!maps.length) continue;
    const short = await isShort(v.id);
    const lang = /[぀-ヿ一-鿿]/.test(title) ? 'ja' : 'en';
    for (const agent of agents)
      for (const map of maps)
        added.push({
          agent,
          map,
          youtubeId: v.id,
          title,
          channel: channelTitle,
          lang,
          ...(short ? { short: true } : {}),
          addedAt: now.toISOString().slice(0, 10),
        });
  }
}

if (added.length) {
  const current = JSON.parse(await readFile(outPath, 'utf8').catch(() => '[]'));
  await writeFile(outPath, JSON.stringify([...current, ...added], null, 1) + '\n');
}
await writeFile(statePath, JSON.stringify({ lastRun: now.toISOString() }, null, 2) + '\n');
console.log(`検索 ${queries.length} 回 / 候補 ${ids.length} 本 / 追加 ${new Set(added.map((e) => e.youtubeId)).size} 本`);
