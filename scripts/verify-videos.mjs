// data/videos.json の全動画を YouTube oEmbed で、data/posts.json の全ポストを X oEmbed で確認し、
// 削除・非公開になったものを報告する。
// 使い方: node scripts/verify-videos.mjs [--prune]
//   --prune を付けると、見つからなかったものを data/sources/*.json・data/sources/x/*.json から取り除く。
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../data/', import.meta.url);
const videos = JSON.parse(await readFile(new URL('videos.json', root), 'utf8'));
const posts = JSON.parse(await readFile(new URL('posts.json', root), 'utf8').catch(() => '[]'));
const prune = process.argv.includes('--prune');
const CONCURRENCY = 8;

const youtubeUrl = (v) =>
  `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}`;
const xUrl = (p) => `https://publish.x.com/oembed?omit_script=1&url=${encodeURIComponent(`https://x.com/${p.handle}/status/${p.id}`)}`;

async function check(url, id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) return true;
    // 401/403/404 は埋め込み不可・非公開・削除
    if ([400, 401, 403, 404].includes(res.status)) return false;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${id}: oEmbed に接続できません`);
}

async function findDead(items, urlOf) {
  const dead = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const item = items[next++];
        if (!(await check(urlOf(item), item.id))) dead.push(item);
      }
    }),
  );
  return dead;
}

const deadVideos = await findDead(videos, youtubeUrl);
console.log(`動画: ${videos.length} 本 / 見つからない: ${deadVideos.length} 本`);
for (const v of deadVideos) console.log(`  ${v.id}  ${v.title}`);

const deadPosts = await findDead(posts, xUrl);
console.log(`X ポスト: ${posts.length} 件 / 見つからない: ${deadPosts.length} 件`);
for (const p of deadPosts) console.log(`  ${p.id}  @${p.handle}  ${p.text.split('\n')[0].slice(0, 40)}`);

async function pruneDir(dir, key, deadIds) {
  for (const file of (await readdir(new URL(dir, root)).catch(() => [])).filter((f) => f.endsWith('.json'))) {
    const path = new URL(`${dir}${file}`, root);
    const entries = JSON.parse(await readFile(path, 'utf8'));
    const kept = entries.filter((e) => !deadIds.has(e[key]));
    if (kept.length !== entries.length) await writeFile(path, JSON.stringify(kept, null, 1) + '\n');
  }
}

const deadCount = deadVideos.length + deadPosts.length;
// 一度に大量に消えるのは通信側の問題（アクセス制限など）の可能性が高いので、削除せずに止める
const limit = Math.max(10, Math.ceil((videos.length + posts.length) * 0.03));
if (prune && deadCount > limit) {
  console.error(`見つからないものが多すぎます（${deadCount} 件 > ${limit} 件）。安全のため削除しません。`);
  process.exit(1);
}
if (prune && deadCount) {
  await pruneDir('sources/', 'youtubeId', new Set(deadVideos.map((v) => v.id)));
  await pruneDir('sources/x/', 'postId', new Set(deadPosts.map((p) => p.id)));
  console.log('sources から削除しました。npm run merge で videos.json / posts.json を再生成してください。');
}
process.exitCode = deadCount && !prune ? 1 : 0;
