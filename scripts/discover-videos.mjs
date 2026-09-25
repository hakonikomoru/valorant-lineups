// data/channels.json のチャンネルの新着を RSS（API キー不要）で調べ、定点動画を data/sources/auto.json に追記する。
// GitHub Actions で毎日実行する。使い方: node scripts/discover-videos.mjs
//
// - RSS はチャンネルごとの最新 15 本。毎日見るので取りこぼしはほぼ無い
// - タイトルに「定点系の語」「エージェント名」「マップ名」がそろうものだけ採用する（マップ名が無ければ見送る）
// - 埋め込み不可・非公開の動画は oEmbed で除外。ショートかどうかは /shorts/ の oEmbed で判定する
// - チャンネルの追加は scripts/add-channel.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../data/', import.meta.url);
const outPath = new URL('sources/auto.json', root);
const meta = JSON.parse(await readFile(new URL('meta.json', root), 'utf8'));
const channels = JSON.parse(await readFile(new URL('channels.json', root), 'utf8').catch(() => '[]'));
const CONCURRENCY = 6;

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

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok || [400, 401, 403, 404].includes(res.status)) return res;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

async function feedOf(channel) {
  const res = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`);
  if (!res?.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([\w-]{11})<\/yt:videoId>[\s\S]*?<title>([^<]*)<\/title>/g)].map(
    ([, id, title]) => ({ id, title: decode(title), channel }),
  );
}

// タイトルからエージェントとマップを判定する。定点の動画でなければ null
function classify(title) {
  if (!LINEUP.test(title)) return null;
  const agents = agentRules.filter(([, re]) => re.test(title)).map(([slug]) => slug);
  if (!agents.length) return null;
  // ハッシュタグだけに出てくるマップ名（#フラクチャー など）は無関係なことが多いので見ない
  const body = title.replace(/#\S+/g, '');
  let maps = mapRules.filter(([, re]) => re.test(body)).map(([slug]) => slug);
  if (ALL_MAPS.test(title) || maps.length > 3) maps = ['all'];
  if (!maps.length) return null;
  return { agents, maps };
}

async function oembed(id, kind) {
  const res = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/${kind}${id}`)}`);
  return res?.ok ? res.json() : null;
}

// 既に収録済みの動画
const known = new Set();
for (const f of (await readdir(new URL('sources/', root))).filter((f) => f.endsWith('.json'))) {
  for (const e of JSON.parse(await readFile(new URL(`sources/${f}`, root), 'utf8'))) known.add(e.youtubeId);
}

async function pool(items, fn) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) out.push(await fn(items[next++]));
    }),
  );
  return out;
}

const entries = (await pool(channels, feedOf)).flat().filter((e) => !known.has(e.id));
const candidates = entries.map((e) => ({ ...e, match: classify(e.title) })).filter((e) => e.match);

const today = new Date().toISOString().slice(0, 10);
const added = (
  await pool(candidates, async ({ id, match, channel }) => {
    // 埋め込みできない動画（非公開・埋め込み無効）は oEmbed が失敗する
    const info = await oembed(id, 'watch?v=');
    if (!info) return [];
    const short = await oembed(id, 'shorts/').then((s) => s && s.height > s.width);
    const lang = /[぀-ヿ一-鿿]/.test(info.title) ? 'ja' : (channel.lang ?? 'en');
    return match.agents.flatMap((agent) =>
      match.maps.map((map) => ({
        agent,
        map,
        youtubeId: id,
        title: info.title,
        channel: info.author_name,
        lang,
        ...(short ? { short: true } : {}),
        addedAt: today,
      })),
    );
  })
).flat();

if (added.length) {
  const current = JSON.parse(await readFile(outPath, 'utf8').catch(() => '[]'));
  await writeFile(outPath, JSON.stringify([...current, ...added], null, 1) + '\n');
}
const addedVideos = [...new Map(added.map((e) => [e.youtubeId, e])).values()];
console.log(`チャンネル ${channels.length} / 未収録の新着 ${entries.length} 本 / 定点と判定 ${candidates.length} 本 / 追加 ${addedVideos.length} 本`);
for (const e of addedVideos) console.log(`  + ${e.title}（${e.channel}）`);
