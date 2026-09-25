// data/sources/x/*.json の全ポストのメディアの種類を X の syndication API で調べ、"media" に記録する。
//   video: 動画付き / photo: 画像のみ / card: リンクカード（YouTube・記事など）/ none: 本文のみ
// 動画付きのポストには、サムネイル（thumb）・長さ（duration 秒）・縦長かどうか（vertical）も記録する。
// サイトには動画付きのポストだけを載せる（merge は media が video のものだけを posts.json に入れる）。
// 使い方: node scripts/check-x-media.mjs [--prune]
//   --prune を付けると、動画の無いポストを sources から取り除く。
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../data/sources/x/', import.meta.url);
const prune = process.argv.includes('--prune');
const CONCURRENCY = 6;

// 埋め込みウィジェットと同じ計算でトークンを作る
const token = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');

async function infoOf(id) {
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=ja&token=${token(id)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 404) return { media: 'gone' };
      if (res.ok) {
        const post = await res.json();
        const details = post.mediaDetails ?? [];
        const video = details.find((m) => m.type === 'video' || m.type === 'animated_gif');
        if (video) {
          const { width, height } = video.original_info ?? {};
          const ms = video.video_info?.duration_millis ?? post.video?.durationMs;
          return {
            media: 'video',
            thumb: video.media_url_https,
            ...(ms ? { duration: Math.round(ms / 1000) } : {}),
            ...(height > width ? { vertical: true } : {}),
          };
        }
        if (details.some((m) => m.type === 'photo')) return { media: 'photo' };
        return { media: post.card ? 'card' : 'none' };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${id}: syndication API に接続できません`);
}

const files = (await readdir(root)).filter((f) => f.endsWith('.json')).sort();
const sources = await Promise.all(files.map(async (f) => [f, JSON.parse(await readFile(new URL(f, root), 'utf8'))]));
const ids = [...new Set(sources.flatMap(([, entries]) => entries.map((e) => e.postId)))];

const info = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      info.set(id, await infoOf(id));
    }
  }),
);

for (const [file, entries] of sources) {
  let kept = entries.map(({ hasMedia, media, thumb, duration, vertical, ...e }) => ({ ...e, ...info.get(e.postId) }));
  if (prune) kept = kept.filter((e) => e.media === 'video');
  await writeFile(new URL(file, root), JSON.stringify(kept, null, 1) + '\n');
}

const count = Object.groupBy([...info.values()], (m) => m.media);
console.log(`確認: ${ids.length} 件 / ${Object.entries(count).map(([k, v]) => `${k} ${v.length}`).join('・')}`);
if (prune) console.log('動画の無いポストを sources から削除しました。npm run merge で posts.json を再生成してください。');
