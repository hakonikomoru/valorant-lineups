// data/vct/sources/vlr/*.json と data/vct/sources/vods.json から、サイトが読む data/vct/matches.json を作る。
// 使い方: node scripts/vct/merge-matches.mjs
//
// - 公式チャンネル（scripts/vct/official.mjs）の、再生できる VOD があるマップだけを載せる
// - 1 本の動画に複数マップが入っているときは、マップごとの開始秒（vod.start）で頭出しする
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { loadEvents } from './events.mjs';
import { OFFICIAL_CHANNELS, handleOf } from './official.mjs';
import { normalizeTimeline } from './lib/timeline.mjs';
import { LOGO_DIR, logoFile } from './lib/logos.mjs';

const EVENTS = await loadEvents();

const root = new URL('../../data/vct/', import.meta.url);
const read = async (p, fallback) => JSON.parse(await readFile(new URL(p, root), 'utf8').catch(() => JSON.stringify(fallback)));
const meta = JSON.parse(await readFile(new URL('../../data/meta.json', import.meta.url), 'utf8'));
const vods = await read('sources/vods.json', {});
// 開始秒の手直し: { "<vlr の試合 ID>": { "<マップ番号>": { "start": 秒 } } }（scripts/vct/lib/timeline.mjs）
const overrides = await read('sources/overrides.json', {});
const mapSlugs = new Set(meta.maps.map((m) => m.slug));
const agentSlugs = new Set(meta.agents.map((a) => a.slug));

const teams = {};
const matches = [];
const skipped = { noVod: 0, unofficial: 0, dead: 0, unknownMap: 0 };
const unofficialChannels = new Map();

// チームロゴは scripts/vct/fetch-logos.mjs で assets/vct/teams/ に保存したものを使う（vlr.gg の画像は直リンクできない）
const savedLogos = new Set(await readdir(new URL('../../assets/vct/teams/', import.meta.url)).catch(() => []));
const localLogo = (url) => (savedLogos.has(logoFile(url)) ? LOGO_DIR + logoFile(url) : '');

const teamIdOf = (vlrPath) => vlrPath.match(/\/team\/(\d+)/)?.[1] ?? '';

for (const event of EVENTS) {
  const source = await read(`sources/vlr/${event.id}.json`, []);
  for (const m of source) {
    const teamIds = m.teams.map((t) => teamIdOf(t.vlr) || t.name);
    m.teams.forEach((t, i) => {
      // チームの略称は選手の所属表示（TL・PRX など）から取る
      const tag = m.games.map((g) => g.players[i]?.[0]?.tag).find(Boolean) ?? '';
      teams[teamIds[i]] = { name: t.name, tag: tag || teams[teamIds[i]]?.tag || t.name, logo: localLogo(t.logo) };
    });
    const games = [];
    // 全マップに VOD があるときだけ、開始秒の重複を直し、開始秒の順に MAP 番号を振り直す
    const timeline = m.games.every((g) => g.vod) ? normalizeTimeline(m.games, overrides[m.id]) : m.games;
    for (const g of timeline) {
      if (!mapSlugs.has(g.map)) {
        skipped.unknownMap++;
        continue;
      }
      if (!g.vod) {
        skipped.noVod++;
        continue;
      }
      const info = vods[g.vod.id];
      if (!info?.ok) {
        skipped.dead++;
        continue;
      }
      const handle = handleOf(info.channelUrl);
      if (!OFFICIAL_CHANNELS[handle]) {
        skipped.unofficial++;
        unofficialChannels.set(info.channel, (unofficialChannels.get(info.channel) ?? 0) + 1);
        continue;
      }
      games.push({
        n: g.n,
        map: g.map,
        score: g.score,
        pick: g.pick,
        duration: g.duration,
        comps: g.players.map((side) => side.map((p) => (agentSlugs.has(p.agent) ? p.agent : '')).filter(Boolean)),
        players: g.players.map((side) => side.map((p) => p.name)),
        vod: { id: g.vod.id, start: g.vod.start, channel: handle, ...(g.vod.estimated ? { estimated: true } : {}) },
      });
    }
    if (!games.length) continue;
    matches.push({
      id: m.id,
      event: event.slug,
      series: m.series,
      date: m.date,
      patch: m.patch,
      bestOf: m.bestOf,
      teams: teamIds,
      score: m.teams.map((t) => t.score),
      maps: m.games.length,
      games: games.sort((a, b) => a.n - b.n),
    });
  }
}
matches.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

const vodTitles = {};
for (const m of matches) for (const g of m.games) vodTitles[g.vod.id] = vods[g.vod.id].title;

const events = [...EVENTS]
  .reverse()
  .map(({ id, ...e }) => ({ ...e, vlrId: id, matches: matches.filter((m) => m.event === e.slug).length }))
  .filter((e) => e.matches);
const channels = Object.fromEntries(Object.entries(OFFICIAL_CHANNELS).map(([h, c]) => [h, c.name]));

const out = { events, channels, teams, vodTitles, matches };
await writeFile(new URL('matches.json', root), JSON.stringify(out) + '\n');
const gameCount = matches.reduce((n, m) => n + m.games.length, 0);
console.log(`matches.json: 試合 ${matches.length} / マップ ${gameCount} / 大会 ${events.length} / チーム ${Object.keys(teams).length}`);
console.log(
  `  載せなかったマップ: VOD なし ${skipped.noVod} / 公式以外 ${skipped.unofficial} / 再生できない ${skipped.dead} / 未知のマップ ${skipped.unknownMap}`,
);
for (const [ch, n] of unofficialChannels) console.log(`  公式以外: ${ch} ${n}`);
