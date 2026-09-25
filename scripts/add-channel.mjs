// 新着を見に行く YouTube チャンネルを data/channels.json に登録する。
// 使い方:
//   node scripts/add-channel.mjs @valo-xyz                 ハンドルで登録
//   node scripts/add-channel.mjs https://youtu.be/XXXXXXXXXXX   動画の URL（または ID）から、その投稿者を登録
//   node scripts/add-channel.mjs --from-archive 3          収録済みの動画が 3 本以上あるチャンネルをまとめて登録
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../data/', import.meta.url);
const path = new URL('channels.json', root);
const channels = JSON.parse(await readFile(path, 'utf8').catch(() => '[]'));
const knownIds = new Set(channels.map((c) => c.id));

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'accept-language': 'ja' }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

// チャンネルのページから ID（UC で始まる 24 文字）と名前を読む
async function resolveChannel(url) {
  const direct = url.match(/\/channel\/(UC[\w-]{22})/)?.[1];
  const res = await get(url);
  const html = res ? await res.text() : '';
  const id = direct ?? html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1];
  if (!id) return null;
  const name = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '';
  const handle = html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/)?.[1] ?? url.match(/\/(@[^/?]+)/)?.[1] ?? '';
  return { id, name: decode(name), handle: decodeURIComponent(handle) };
}
const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// 動画 ID から投稿者のチャンネル URL を得る（oEmbed の author_url）
async function channelUrlOfVideo(id) {
  const res = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
  return res ? (await res.json()).author_url : null;
}

async function add(target, extra = {}) {
  const videoId = target.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? (/^[\w-]{11}$/.test(target) ? target : null);
  const url = videoId
    ? await channelUrlOfVideo(videoId)
    : target.startsWith('@')
      ? `https://www.youtube.com/${target}`
      : target;
  const ch = url && (await resolveChannel(url));
  if (!ch) return console.log(`  見つかりません: ${target}`);
  if (knownIds.has(ch.id)) return console.log(`  登録済み: ${ch.name}`);
  knownIds.add(ch.id);
  channels.push({ ...ch, ...extra });
  console.log(`  追加: ${ch.name} ${ch.handle}`);
}

const args = process.argv.slice(2);
const fromArchive = args.indexOf('--from-archive');
if (fromArchive >= 0) {
  const min = Number(args[fromArchive + 1] ?? 3);
  const videos = JSON.parse(await readFile(new URL('videos.json', root), 'utf8'));
  const byChannel = Map.groupBy(videos, (v) => v.channel);
  const targets = [...byChannel].filter(([, list]) => list.length >= min).sort((a, b) => b[1].length - a[1].length);
  console.log(`収録 ${min} 本以上のチャンネル: ${targets.length}`);
  for (const [, list] of targets) await add(list[0].id, { lang: list.filter((v) => v.lang === 'ja').length * 2 >= list.length ? 'ja' : 'en' });
} else if (args.length) {
  for (const target of args) await add(target);
} else {
  console.log('使い方: node scripts/add-channel.mjs <@ハンドル | 動画URL | --from-archive 3>');
}

await writeFile(path, JSON.stringify(channels, null, 2) + '\n');
console.log(`channels.json: ${channels.length} チャンネル`);
