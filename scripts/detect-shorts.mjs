// data/sources/*.json の全動画を YouTube oEmbed で調べ、ショート動画（縦長）に "short": true を付ける。
// /shorts/<ID> の URL で oEmbed を引くと、ショートだけ縦長（113x200）が返るのでそれで判定する。
// （watch?v= の URL だとショートでも横長が返るので使えない）
// 使い方: node scripts/detect-shorts.mjs  → その後 npm run merge
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../data/sources/', import.meta.url);
const CONCURRENCY = 8;

async function isShort(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/shorts/${id}`)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const { width, height } = await res.json();
        return height > width;
      }
      if ([400, 401, 403, 404].includes(res.status)) return null; // 削除・非公開は verify に任せる
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${id}: oEmbed に接続できません`);
}

const files = (await readdir(root)).filter((f) => f.endsWith('.json')).sort();
const sources = await Promise.all(files.map(async (f) => [f, JSON.parse(await readFile(new URL(f, root), 'utf8'))]));
const ids = [...new Set(sources.flatMap(([, entries]) => entries.map((e) => e.youtubeId)))];

// true / false / null（判定できなかった。今の値をそのまま残す）
const shorts = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      shorts.set(id, await isShort(id));
    }
  }),
);

for (const [file, entries] of sources) {
  let changed = false;
  for (const e of entries) {
    const short = shorts.get(e.youtubeId);
    if (short !== null && short !== Boolean(e.short)) {
      short ? (e.short = true) : delete e.short;
      changed = true;
    }
  }
  if (changed) await writeFile(new URL(file, root), JSON.stringify(entries, null, 1) + '\n');
}
console.log(`確認: ${ids.length} 本 / ショート: ${[...shorts.values()].filter(Boolean).length} 本`);
