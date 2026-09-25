// data/sources/*.json を統合して data/videos.json を、data/sources/x/*.json から data/posts.json を生成する。
// 同じ動画が複数のエージェント・マップに登録されていれば 1 件にまとめる。
// 使い方: node scripts/merge-videos.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../data/', import.meta.url);
const meta = JSON.parse(await readFile(new URL('meta.json', root), 'utf8'));
const agentSlugs = new Set(meta.agents.map((a) => a.slug));
const mapSlugs = new Set([...meta.maps.map((m) => m.slug), 'all']);

// タイトルのキーワードから分類タグを推定する
const TAG_RULES = {
  attack: /攻め|攻撃|アタッカー|エントリー|attack|entry/i,
  defense: /守り|防衛|ディフェンス|defen[cs]e|defender/i,
  postplant: /設置後|ポストプラント|解除(阻止|止め|させない)|post[\s-]?plant|anti[\s-]?defuse/i,
  retake: /リテイク|retake/i,
  oneway: /ワンウェイ|one[\s-]?ways?/i,
  setup: /セットアップ|置きカメラ|setups?\b/i,
  molly: /モロトフ|モロ定点|モリー|空爆|インセンディアリー|スネークバイト|ナノスワーム|フラグ\/?メント|モッシュピット|ホットハンズ|moll(y|ies)|molotov|incendiary|snake\s?bite|nanoswarm|frag\/?ment|mosh\s?pit|hot\s?hands/i,
};

const byId = new Map();
const files = (await readdir(new URL('sources/', root))).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  const entries = JSON.parse(await readFile(new URL(`sources/${file}`, root), 'utf8'));
  for (const e of entries) {
    if (!/^[\w-]{11}$/.test(e.youtubeId)) throw new Error(`${file}: 不正な動画ID ${e.youtubeId}`);
    if (!agentSlugs.has(e.agent)) throw new Error(`${file}: 未知のエージェント ${e.agent}`);
    if (!mapSlugs.has(e.map)) throw new Error(`${file}: 未知のマップ ${e.map}`);
    const v = byId.get(e.youtubeId) ?? {
      id: e.youtubeId,
      title: e.title,
      channel: e.channel,
      lang: e.lang,
      agents: [],
      maps: [],
      short: false,
      extraTags: [],
    };
    if (!v.agents.includes(e.agent)) v.agents.push(e.agent);
    if (!v.maps.includes(e.map)) v.maps.push(e.map);
    if (e.short) v.short = true;
    // sources 側で明示したタグ（タイトルから推定できないもの）
    for (const t of e.tags ?? []) if (!v.extraTags.includes(t)) v.extraTags.push(t);
    byId.set(e.youtubeId, v);
  }
}

const tagsOf = (text, extra = []) =>
  Object.entries(TAG_RULES)
    .filter(([tag, re]) => re.test(text) || extra.includes(tag))
    .map(([tag]) => tag);

const videos = [...byId.values()].map(({ extraTags, ...v }) => ({ ...v, tags: tagsOf(v.title, extraTags) }));

await writeFile(new URL('videos.json', root), JSON.stringify(videos, null, 2) + '\n');
console.log(`videos.json: ${videos.length} 本（${files.length} ファイルから）`);

// X のポスト: data/sources/x/*.json → data/posts.json
const postsById = new Map();
const xFiles = (await readdir(new URL('sources/x/', root)).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
for (const file of xFiles) {
  const entries = JSON.parse(await readFile(new URL(`sources/x/${file}`, root), 'utf8'));
  for (const e of entries) {
    // サイトに載せるのは動画付きのポストだけ（npm run x-media で判定）
    if (e.media !== 'video') continue;
    if (!/^\d{5,25}$/.test(e.postId)) throw new Error(`x/${file}: 不正なポストID ${e.postId}`);
    if (!agentSlugs.has(e.agent)) throw new Error(`x/${file}: 未知のエージェント ${e.agent}`);
    if (!mapSlugs.has(e.map)) throw new Error(`x/${file}: 未知のマップ ${e.map}`);
    const p = postsById.get(e.postId) ?? {
      id: e.postId,
      handle: e.handle,
      author: e.author,
      text: e.text,
      date: e.date ?? '',
      lang: e.lang,
      thumb: e.thumb ?? '',
      duration: e.duration ?? 0,
      vertical: Boolean(e.vertical),
      agents: [],
      maps: [],
      extraTags: [],
    };
    if (!p.agents.includes(e.agent)) p.agents.push(e.agent);
    if (!p.maps.includes(e.map)) p.maps.push(e.map);
    for (const t of e.tags ?? []) if (!p.extraTags.includes(t)) p.extraTags.push(t);
    postsById.set(e.postId, p);
  }
}
const posts = [...postsById.values()]
  .map(({ extraTags, ...p }) => ({ ...p, tags: tagsOf(p.text, extraTags) }))
  .sort((a, b) => b.date.localeCompare(a.date));
await writeFile(new URL('posts.json', root), JSON.stringify(posts, null, 2) + '\n');
console.log(`posts.json: ${posts.length} 件（${xFiles.length} ファイルから）`);
