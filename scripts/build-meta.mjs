// valorant-api.com からエージェント・マップ情報を取得し data/meta.json を生成する。
// 使い方: node scripts/build-meta.mjs
import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://valorant-api.com/v1';

// 現在のコンペティティブ・マッププール（Act ごとに入れ替わるので手動で更新する）
// 2026-09 時点（パッチ 13.04〜13.06）
const COMPETITIVE_POOL = ['abyss', 'ascent', 'haven', 'lotus', 'split', 'sunset', 'summit'];

const ROLE_ORDER = ['Initiator', 'Controller', 'Sentinel', 'Duelist'];
const SLOT_KEY = { Grenade: 'C', Ability1: 'Q', Ability2: 'E', Ultimate: 'X' };

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
// API の日本語名には改行が含まれることがある
const clean = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).data;
}

const [agentsEn, agentsJa, mapsEn, mapsJa, version] = await Promise.all([
  get('/agents?isPlayableCharacter=true'),
  get('/agents?isPlayableCharacter=true&language=ja-JP'),
  get('/maps'),
  get('/maps?language=ja-JP'),
  get('/version'),
]);

const jaAgent = new Map(agentsJa.map((a) => [a.uuid, a]));
const agents = agentsEn
  .map((en) => {
    const ja = jaAgent.get(en.uuid);
    return {
      slug: slugify(en.displayName),
      uuid: en.uuid,
      name: clean(ja.displayName),
      nameEn: en.displayName,
      role: en.role.displayName,
      roleName: clean(ja.role.displayName),
      icon: en.displayIcon,
      portrait: en.fullPortrait,
      gradient: en.backgroundGradientColors.map((c) => `#${c.slice(0, 6)}`),
      releaseDate: en.releaseDate,
      abilities: ja.abilities
        .filter((ab) => SLOT_KEY[ab.slot])
        .map((ab) => ({ key: SLOT_KEY[ab.slot], name: clean(ab.displayName), icon: ab.displayIcon }))
        .sort((a, b) => 'CQEX'.indexOf(a.key) - 'CQEX'.indexOf(b.key)),
    };
  })
  .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.nameEn.localeCompare(b.nameEn));

const jaMap = new Map(mapsJa.map((m) => [m.uuid, m]));
const maps = mapsEn
  // tacticalDescription があるのは通常の 5v5 マップだけ（TDM・射撃場などを除外）
  .filter((m) => m.tacticalDescription)
  .map((en) => {
    const slug = slugify(en.displayName);
    return {
      slug,
      uuid: en.uuid,
      name: clean(jaMap.get(en.uuid).displayName),
      nameEn: en.displayName,
      sites: en.tacticalDescription.replace(/ Sites?$/, ''),
      inPool: COMPETITIVE_POOL.includes(slug),
      splash: en.splash,
      banner: en.listViewIcon,
    };
  })
  .sort((a, b) => Number(b.inPool) - Number(a.inPool) || a.nameEn.localeCompare(b.nameEn));

const missing = COMPETITIVE_POOL.filter((s) => !maps.some((m) => m.slug === s));
if (missing.length) throw new Error(`プールのマップが API にありません: ${missing.join(', ')}`);

const path = new URL('../data/meta.json', import.meta.url);
const prev = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
const content = { gameVersion: version.riotClientVersion, agents, maps };
// 中身が同じなら書き換えない（自動更新で generatedAt だけのコミットが毎日できないように）
if (JSON.stringify({ gameVersion: prev.gameVersion, agents: prev.agents, maps: prev.maps }) === JSON.stringify(content)) {
  console.log('meta.json: 変更なし');
  process.exit(0);
}
const meta = { gameVersion: content.gameVersion, generatedAt: new Date().toISOString(), agents, maps };
await writeFile(path, JSON.stringify(meta, null, 2) + '\n');
console.log(`meta.json: ${agents.length} agents, ${maps.length} maps (${version.riotClientVersion})`);
