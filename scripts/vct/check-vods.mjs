// data/vct/sources/vlr/*.json の VOD（YouTube）を oEmbed で調べ、動画タイトル・投稿チャンネルを data/vct/sources/vods.json に記録する。
// 使い方: node scripts/vct/check-vods.mjs [--recheck]
//   --recheck  記録済みの動画も調べ直す（削除・非公開になったものを見つける）
//
// - oEmbed が 401/403/404 を返す動画は、非公開・削除・埋め込み不可（サイト内で再生できない）として ok: false にする
// - どのチャンネルを公式とみなすかは scripts/vct/official.mjs。ここでは記録だけする
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../data/vct/sources/', import.meta.url);
const path = new URL('vods.json', root);
const recheck = process.argv.includes('--recheck');
const CONCURRENCY = 6;

const vods = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
const ids = new Set();
for (const f of (await readdir(new URL('vlr/', root))).filter((f) => f.endsWith('.json'))) {
  for (const m of JSON.parse(await readFile(new URL(`vlr/${f}`, root), 'utf8'))) {
    for (const g of m.games) if (g.vod) ids.add(g.vod.id);
    if (m.fullVod) ids.add(m.fullVod.id);
  }
}
const targets = [...ids].filter((id) => recheck || !vods[id]);

async function oembed(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) return res.json();
      if ([400, 401, 403, 404].includes(res.status)) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${id}: oEmbed に接続できません`);
}

let next = 0;
let dead = 0;
const today = new Date().toISOString().slice(0, 10);
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < targets.length) {
      const id = targets[next++];
      const info = await oembed(id);
      if (!info) dead++;
      vods[id] = info
        ? { ok: true, title: info.title, channel: info.author_name, channelUrl: info.author_url, checkedAt: today }
        : { ...vods[id], ok: false, checkedAt: today };
    }
  }),
);

const sorted = Object.fromEntries(Object.entries(vods).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(path, JSON.stringify(sorted, null, 1) + '\n');
console.log(`VOD ${ids.size} 本 / 今回調べた ${targets.length} 本 / 再生できない ${dead} 本`);
const byChannel = new Map();
for (const id of ids) {
  const v = vods[id];
  const key = v?.ok ? `${v.channel} (${v.channelUrl})` : '(再生できない)';
  byChannel.set(key, (byChannel.get(key) ?? 0) + 1);
}
for (const [ch, n] of [...byChannel].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${ch}`);
