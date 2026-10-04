import { SITE, ALL, routePath, parsePath, seoFor } from './seo.js';

const REGIONS = { international: '国際大会', americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };
const PAGE_SIZE = 60;

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// データは main.js が読み込んでから、この app.js を読み込む
const { meta, data } = window.__VCT_DATA__;
const agentBySlug = new Map(meta.agents.map((a) => [a.slug, a]));
const mapBySlug = new Map(meta.maps.map((m) => [m.slug, m]));
const eventBySlug = new Map(data.events.map((e) => [e.slug, e]));
const teamOf = (id) => data.teams[id] ?? { name: id, tag: id, logo: '' };

// 1 マップ = 1 枚のカード。試合（match）とそのマップ（game）の組
const items = [];
for (const m of data.matches) {
  for (const g of m.games) {
    const teams = m.teams.map(teamOf);
    items.push({
      key: `${m.id}-${g.n}`,
      m,
      g,
      region: eventBySlug.get(m.event).region,
    });
  }
}
const itemByKey = new Map(items.map((it) => [it.key, it]));
// 選手名 → 最後に出場したチーム（選手の一覧をチームごとにまとめるのに使う）。名前は大文字・小文字の違いも含めて vlr.gg の表記のまま
const playerTeam = new Map();
for (const it of items) it.g.players.forEach((side, i) => side.forEach((p) => playerTeam.set(p, it.m.teams[i])));
// チーム → 地域（地域リーグの試合から決める。国際大会にしか出ていないチームは「その他」）
const teamRegion = new Map();
for (const it of items) if (it.region !== 'international') for (const t of it.m.teams) teamRegion.set(t, it.region);

// map / event はパス、それ以外の絞り込みはクエリ（?team=474&player=Jinggg&agents=sova,omen）で持つ
const state = { map: ALL, event: ALL, region: '', team: '', player: '', agents: new Set(), limit: PAGE_SIZE };

/* ---------- 絞り込み ---------- */
// except に入れた条件は無視して絞る（タブ・ボタンの件数を、その条件以外で数えるため）
function filtered(except = []) {
  const skip = new Set(except);
  return items.filter((it) => {
    if (!skip.has('map') && state.map !== ALL && it.g.map !== state.map) return false;
    if (!skip.has('event') && state.event !== ALL && it.m.event !== state.event) return false;
    if (!skip.has('region') && state.region && it.region !== state.region) return false;
    if (!skip.has('team') && state.team && !it.m.teams.includes(state.team)) return false;
    if (!skip.has('player') && state.player && !it.g.players.some((side) => side.includes(state.player))) return false;
    if (!skip.has('agents') && state.agents.size && !sidesWithAgents(it).length) return false;
    return true;
  });
}
// チーム・選手を選んでいれば、そのチーム（その選手のいるチーム）の側だけを構成の集計・絞り込みに使う
const sideSelected = (it, side) =>
  (!state.team || it.m.teams[side] === state.team) && (!state.player || it.g.players[side].includes(state.player));
// 選んだエージェントをすべて含む構成のチーム（0 / 1）
function sidesWithAgents(it) {
  return [0, 1].filter((side) => sideSelected(it, side) && [...state.agents].every((a) => it.g.comps[side].includes(a)));
}

/* ---------- ルーティング ---------- */
function readRoute() {
  const { map, event } = parsePath(location.pathname);
  state.map = mapBySlug.has(map) ? map : ALL;
  state.event = eventBySlug.has(event) ? event : ALL;
  const q = new URLSearchParams(location.search);
  state.region = REGIONS[q.get('region')] ? q.get('region') : '';
  state.team = data.teams[q.get('team')] ? q.get('team') : '';
  state.player = playerTeam.has(q.get('player')) ? q.get('player') : '';
  state.agents = new Set((q.get('agents') ?? '').split(',').filter((a) => agentBySlug.has(a)));
  state.limit = PAGE_SIZE;
}
function writeRoute(push) {
  const q = new URLSearchParams();
  if (state.region) q.set('region', state.region);
  if (state.team) q.set('team', state.team);
  if (state.player) q.set('player', state.player);
  if (state.agents.size) q.set('agents', [...state.agents].join(','));
  const url = routePath(state) + (q.toString() ? `?${q.toString().replace(/%2C/g, ',')}` : '');
  if (location.pathname + location.search === url) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function setMeta(count) {
  const { title, description } = seoFor(state, data, meta, count);
  const url = SITE.url + routePath(state);
  document.title = title;
  for (const [sel, attr, value] of [
    ['meta[name="description"]', 'content', description],
    ['meta[property="og:title"]', 'content', title],
    ['meta[property="og:description"]', 'content', description],
    ['meta[property="og:url"]', 'content', url],
    ['link[rel="canonical"]', 'href', url],
  ])
    document.querySelector(sel)?.setAttribute(attr, value);
}

/* ---------- 表示用の小物 ---------- */
// 横スクロール一覧の中で、選択中のものが見える位置まで送る（ページ自体は動かさない）
function revealSelected(list, selector = '[aria-selected="true"], [aria-pressed="true"]') {
  const el = list.querySelector(selector);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const box = list.getBoundingClientRect();
  if (r.left < box.left) list.scrollLeft += r.left - box.left - 40;
  else if (r.right > box.right) list.scrollLeft += r.right - box.right + 40;
}
const pad = (n) => String(n).padStart(2, '0');
const formatTime = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(sec % 60)}` : `${m}:${pad(sec % 60)}`;
};
// 日付は日本時間で出す
const formatDate = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
};
const youtubeUrl = (vod) => `https://www.youtube.com/watch?v=${vod.id}${vod.start ? `&t=${vod.start}s` : ''}`;
const spoilerFree = () => $('#spoiler-free').checked;
// player を渡すと、ツールチップに選手名を出し、絞り込み中の選手なら目立たせる
const agentIcon = (slug, size = 24, player = '') => {
  const a = agentBySlug.get(slug);
  if (!a) return '';
  const cls = [state.agents.has(slug) && 'is-match', player && player === state.player && 'is-player'].filter(Boolean).join(' ');
  const label = player ? `${player}（${a.name}）` : a.name;
  return `<img${cls ? ` class="${cls}"` : ''} src="${a.icon}" alt="${esc(label)}" title="${esc(label)}" width="${size}" height="${size}" loading="lazy">`;
};
// 1 本の動画に入っているマップの数（FULL MATCH や 1 日の配信まるごとの VOD は 2 以上）
const mapsInVideo = new Map();
for (const it of items) mapsInVideo.set(it.g.vod.id, (mapsInVideo.get(it.g.vod.id) ?? 0) + 1);

function pickLabel(it) {
  if (it.g.pick !== null) return `${esc(teamOf(it.m.teams[it.g.pick]).tag)} PICK`;
  return it.m.maps >= 3 && it.g.n === it.m.maps ? 'DECIDER' : '';
}

/* ---------- 描画 ---------- */
function renderMapTabs() {
  const base = filtered(['map']);
  const count = (slug) => base.filter((it) => it.g.map === slug).length;
  const tab = (m) => {
    const n = count(m.slug);
    return `
      <button type="button" class="map-tab" role="tab" data-map="${m.slug}" aria-selected="${m.slug === state.map}"
        style="--banner:url('${m.banner}')" ${n || m.slug === state.map ? '' : 'disabled'}>
        ${m.inPool ? '<span class="map-tab-pool">POOL</span>' : ''}
        <span class="map-tab-name">${esc(m.nameEn)}</span>
        <span class="map-tab-sub">${esc(m.name)}・${n}</span>
      </button>`;
  };
  // 試合数の多い順（プール内 → プール外）
  const order = (list) => list.map((m) => [m, count(m.slug)]).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  $('#map-tabs').innerHTML = `
    <button type="button" class="map-tab map-tab-all" role="tab" data-map="${ALL}" aria-selected="${state.map === ALL}">
      <span class="map-tab-name">ALL</span>
      <span class="map-tab-sub">${base.length} マップ</span>
    </button>
    ${order(meta.maps.filter((m) => m.inPool)).map(tab).join('')}
    <span class="map-divider" aria-hidden="true"></span>
    ${order(meta.maps.filter((m) => !m.inPool)).map(tab).join('')}`;
}

// マップの紹介と、絞り込んだ試合でのエージェント使用率
function renderHero() {
  const m = mapBySlug.get(state.map);
  const hero = $('#map-hero');
  hero.style.setProperty('--splash', m ? `url('${m.splash}')` : 'none');
  const list = filtered(['agents']);
  // 使用率 = そのエージェントを使ったチーム数 / 構成の数（1 マップにつき 2 チーム。チームを選んでいればそのチームだけ）
  const use = new Map();
  let comps = 0;
  for (const it of list) {
    for (const side of [0, 1]) {
      if (!sideSelected(it, side)) continue;
      comps++;
      for (const a of it.g.comps[side]) use.set(a, (use.get(a) ?? 0) + 1);
    }
  }
  const top = [...use].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const e = eventBySlug.get(state.event);
  const scope = [e?.name, state.region && REGIONS[state.region], state.team && teamOf(state.team).name, state.player]
    .filter(Boolean)
    .join(' / ');
  hero.innerHTML = `
    <div class="hero-body">
      <p class="hero-kicker">${m ? `${esc(m.sites)} SITES${m.inPool ? ' / 現在のマッププール' : ''}` : 'ALL MAPS'}</p>
      <h1 class="hero-name">${m ? esc(m.nameEn) : 'VCT MAPS'}</h1>
      <p class="hero-name-ja">${m ? `${esc(m.name)}の試合` : 'すべてのマップの試合'}<span class="hero-count">${list.length} マップ</span></p>
      <p class="hero-desc">${scope ? `${esc(scope)}：` : ''}VCT の公式 VOD を、マップの開始位置から再生できます。1 本の配信に複数のマップが入っている動画も、カードを押すとそのマップから始まります。</p>
    </div>
    ${
      top.length
        ? `<div class="pick-rates">
        <p class="pick-rates-title">エージェント使用率<span>${comps} 構成</span></p>
        <ol>${top
          .map(
            ([a, n]) => `<li>
              <button type="button" data-agent="${a}" aria-pressed="${state.agents.has(a)}" title="${esc(agentBySlug.get(a)?.name ?? a)}で絞り込む">
                ${agentIcon(a, 26)}<span class="pick-rate-name">${esc(agentBySlug.get(a)?.name ?? a)}</span>
                <span class="pick-rate-bar"><span style="width:${((n / comps) * 100).toFixed(1)}%"></span></span>
                <span class="pick-rate-num">${Math.round((n / comps) * 100)}%</span>
              </button></li>`,
          )
          .join('')}</ol>
      </div>`
        : ''
    }`;
}

function renderEventChips() {
  const base = filtered(['event']);
  const chip = (slug, label, n, region = '') =>
    `<button type="button" class="chip event-chip" data-event="${slug}" aria-pressed="${state.event === slug}" ${n || state.event === slug ? '' : 'disabled'}>${region ? `<span class="chip-region chip-region-${region}">${esc(REGIONS[region])}</span>` : ''}${esc(label)}<span class="chip-count">${n}</span></button>`;
  $('#event-chips').innerHTML = [
    chip(ALL, 'すべての大会', base.length),
    ...data.events.map((e) => chip(e.slug, e.name.replace(/^VCT \d{4} /, ''), base.filter((it) => it.m.event === e.slug).length, e.region)),
  ].join('');
}

function renderRegionFilter() {
  const base = filtered(['region']);
  const regions = Object.keys(REGIONS).filter((r) => base.some((it) => it.region === r) || state.region === r);
  $('#region-filter').innerHTML = [['', 'すべての地域'], ...regions.map((r) => [r, REGIONS[r]])]
    .map(([r, label]) => `<button type="button" data-region="${r}" aria-pressed="${state.region === r}">${esc(label)}</button>`)
    .join('');
}

// チームのロゴの一覧（地域ごとの行）。いまの条件で試合が 0 件のチームも薄くして残す（押すと大会・マップの絞り込みを外して出す）
const TEAM_REGIONS = Object.keys(REGIONS).filter((r) => r !== 'international');
function renderTeamPicks() {
  const base = filtered(['team', 'player']);
  const count = new Map();
  for (const it of base) for (const t of it.m.teams) count.set(t, (count.get(t) ?? 0) + 1);
  const rows = TEAM_REGIONS.filter((r) => !state.region || state.region === r || teamRegion.get(state.team) === r)
    .map((r) => {
      const teams = Object.keys(data.teams)
        .filter((id) => teamRegion.get(id) === r)
        .sort((a, b) => teamOf(a).name.localeCompare(teamOf(b).name));
      if (!teams.length) return '';
      return `<div class="team-region">
        <p class="team-region-label"><span class="chip-region chip-region-${r}">${esc(REGIONS[r])}</span></p>
        <div class="team-region-teams">${teams
          .map((id) => {
            const t = teamOf(id);
            const n = count.get(id) ?? 0;
            return `<button type="button" class="team-pick${n ? '' : ' is-empty'}" data-team="${esc(id)}" aria-pressed="${state.team === id}" title="${esc(t.name)}${n ? '' : '（いまの条件では試合がありません）'}">
              ${t.logo ? `<img src="${t.logo}" alt="" width="32" height="32" loading="lazy">` : '<span class="team-pick-nologo"></span>'}
              <span class="team-pick-tag">${esc(t.tag)}</span><span class="team-pick-count">${n}</span>
            </button>`;
          })
          .join('')}</div>
      </div>`;
    })
    .join('');
  $('#team-picks').innerHTML = rows;
  $('#team-clear').hidden = !state.team;
}

// 選んだチーム（選手だけ選んでいればその選手のチーム）の選手。いちばん使っているエージェントのアイコンを添える
function renderPlayerPicks() {
  const team = state.team || playerTeam.get(state.player) || '';
  $('#player-row').hidden = !team;
  if (!team) return;
  const base = filtered(['player']);
  const count = new Map();
  const agents = new Map();
  for (const it of base)
    it.g.players.forEach((side, i) => {
      if (it.m.teams[i] !== team) return;
      side.forEach((p, k) => {
        count.set(p, (count.get(p) ?? 0) + 1);
        const a = agents.get(p) ?? new Map();
        a.set(it.g.comps[i][k], (a.get(it.g.comps[i][k]) ?? 0) + 1);
        agents.set(p, a);
      });
    });
  if (state.player && !count.has(state.player)) count.set(state.player, 0);
  const main = (p) => [...(agents.get(p) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  $('#player-label').textContent = `${teamOf(team).name}の選手`;
  $('#player-picks').innerHTML = [
    `<button type="button" class="chip player-all" data-player="" aria-pressed="${!state.player}">すべての選手</button>`,
    ...[...count]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([p, n]) => {
        const a = agentBySlug.get(main(p));
        return `<button type="button" class="player-pick" data-player="${esc(p)}" aria-pressed="${state.player === p}" title="${esc(p)}${a ? `（よく使うエージェント: ${esc(a.name)}）` : ''}">
          ${a ? `<img src="${a.icon}" alt="" width="28" height="28" loading="lazy">` : ''}<span class="player-pick-name">${esc(p)}</span><span class="player-pick-count">${n}</span>
        </button>`;
      }),
  ].join('');
}

function renderAgentPicks() {
  const base = filtered(['agents']);
  const count = new Map();
  for (const it of base)
    for (const side of [0, 1]) {
      if (!sideSelected(it, side)) continue;
      for (const a of it.g.comps[side]) count.set(a, (count.get(a) ?? 0) + 1);
    }
  const rail = $('#agent-picks');
  const scroll = rail.scrollLeft;
  rail.innerHTML =
    meta.agents
      .filter((a) => count.has(a.slug) || state.agents.has(a.slug))
      .map(
        (a) => `<button type="button" class="agent-pick" data-agent="${a.slug}" aria-pressed="${state.agents.has(a.slug)}" title="${esc(a.name)}">
          <img src="${a.icon}" alt="" width="36" height="36" loading="lazy"><span class="agent-pick-name">${esc(a.name)}</span><span class="agent-pick-count">${count.get(a.slug) ?? 0}</span>
        </button>`,
      )
      .join('') + (state.agents.size ? '<button type="button" class="chip agent-clear" data-agent-clear>解除</button>' : '');
  rail.scrollLeft = scroll;
}

function teamHtml(it, side) {
  const t = teamOf(it.m.teams[side]);
  return `<span class="team team-${side}">
      ${t.logo ? `<img src="${t.logo}" alt="" width="28" height="28" loading="lazy">` : ''}
      <span class="team-tag" title="${esc(t.name)}">${esc(t.tag)}</span>
    </span>`;
}

function gameCard(it) {
  const { m, g } = it;
  const map = mapBySlug.get(g.map);
  const e = eventBySlug.get(m.event);
  const hide = spoilerFree();
  const win = g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1;
  const scoreHtml = hide
    ? '<span class="score score-hidden">VS</span>'
    : `<span class="score"><span class="${win === 0 ? 'is-win' : ''}">${g.score[0]}</span><span class="score-sep">–</span><span class="${win === 1 ? 'is-win' : ''}">${g.score[1]}</span></span>`;
  const multi = mapsInVideo.get(g.vod.id) > 1;
  const pick = pickLabel(it);
  const sides = sidesWithAgents(it);
  return `
    <button type="button" class="game-card" data-key="${it.key}">
      <div class="thumb">
        <img src="https://i.ytimg.com/vi/${g.vod.id}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180">
        <div class="thumb-badges">
          ${state.map === ALL ? `<span class="badge badge-map">${esc(map.name)}</span>` : ''}
          <span class="badge">MAP ${g.n}${m.maps > 1 ? `/${m.maps}` : ''}</span>
          ${pick ? `<span class="badge badge-pick">${pick}</span>` : ''}
        </div>
        ${g.vod.start ? `<span class="badge thumb-start" title="${g.vod.estimated ? '開始位置は推定です（数分ずれることがあります）' : multi ? '複数マップが入った動画の、このマップの開始位置' : 'マップの開始位置'}">▶ ${formatTime(g.vod.start)}〜${g.vod.estimated ? '<span class="thumb-multi">推定</span>' : ''}${multi ? `<span class="thumb-multi">${mapsInVideo.get(g.vod.id)}マップ入り</span>` : ''}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="matchup${hide ? '' : win >= 0 ? ` win-${win}` : ''}">
          ${teamHtml(it, 0)}
          ${scoreHtml}
          ${teamHtml(it, 1)}
        </div>
        <div class="comps">
          <span class="comp${sides.includes(0) && state.agents.size ? ' is-match' : ''}">${g.comps[0].map((a, k) => agentIcon(a, 24, g.players[0][k])).join('')}</span>
          <span class="comp comp-right${sides.includes(1) && state.agents.size ? ' is-match' : ''}">${g.comps[1].map((a, k) => agentIcon(a, 24, g.players[1][k])).join('')}</span>
        </div>
        <div class="card-meta">
          <span class="card-event"><span class="chip-region chip-region-${e.region}">${esc(REGIONS[e.region])}</span>${esc(e.short)}</span>
          <span class="card-series">${esc(m.series)}</span>
          <time datetime="${m.date}">${formatDate(m.date)}</time>
        </div>
      </div>
    </button>`;
}

function renderGrid() {
  const list = filtered();
  const map = mapBySlug.get(state.map);
  const e = eventBySlug.get(state.event);
  $('#result-count').innerHTML = `${esc(map ? map.name : '全マップ')} × ${esc(e ? e.short : 'すべての大会')}：<strong>${list.length}</strong> マップ（${new Set(list.map((it) => it.m.id)).size} 試合）`;
  const grid = $('#game-grid');
  grid.innerHTML = list.length
    ? list.slice(0, state.limit).map(gameCard).join('')
    : '<p class="empty">条件に合う試合がありません。絞り込みを変えてみてください。</p>';
  $('#more').hidden = list.length <= state.limit;
  $('#more').textContent = `さらに表示（残り ${list.length - state.limit} マップ）`;
  return list.length;
}

function render(push = false) {
  writeRoute(push);
  renderMapTabs();
  renderHero();
  renderEventChips();
  renderRegionFilter();
  renderTeamPicks();
  renderPlayerPicks();
  renderAgentPicks();
  const count = renderGrid();
  setMeta(count);
  requestAnimationFrame(revealAll);
}
function revealAll() {
  revealSelected($('#map-tabs'));
  revealSelected($('#event-chips'));
}
window.addEventListener('load', revealAll);

/* ---------- プレイヤー ---------- */
// <dialog> が無いブラウザ（Safari 15.4 未満など）向けに、showModal / close と Esc で閉じる動きを足す
function shimDialog(dialog) {
  if (typeof dialog.showModal === 'function') return;
  dialog.classList.add('dialog-shim');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    if (!dialog.hasAttribute('open')) return;
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  };
  document.addEventListener('keydown', (e) => e.key === 'Escape' && dialog.close());
}
const player = $('#player');
shimDialog(player);

// 動画の開き方（サイト内で再生 / YouTube で開く）。bot 確認が出るブラウザの人向けに選べるようにし、ブラウザに記憶する
// 定点のページ（assets/js/app.js）と同じキー。どちらで選んでもサイト全体で同じ開き方になる
const OPEN_MODE_KEY = 'lineup-open-mode';
const SPOILER_KEY = 'vct-spoiler-free';
let openMode = 'site';
try {
  if (localStorage.getItem(OPEN_MODE_KEY) === 'youtube') openMode = 'youtube';
  $('#spoiler-free').checked = localStorage.getItem(SPOILER_KEY) === '1';
} catch {}
function setOpenMode(mode) {
  openMode = mode;
  try {
    localStorage.setItem(OPEN_MODE_KEY, mode);
  } catch {}
  document.querySelectorAll('#open-mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  $('#always-youtube').checked = mode === 'youtube';
}

// YouTube の公式プレーヤー API で再生が始まったかを見る。bot 確認などで始まらなければ「YouTube で開く」を案内する。
// 同じ動画の別マップへは、読み込み直さずに seekTo で移る（1 本の配信に複数マップが入っている VOD）
let youtubeApi;
const loadYouTubeApi = () =>
  (youtubeApi ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const script = Object.assign(document.createElement('script'), { src: 'https://www.youtube.com/iframe_api', async: true });
    script.onerror = reject;
    document.head.append(script);
  }));
const STUCK_MS = 6000;
let stuckTimer;
let ytPlayer = null;
let ytReady = false;
let currentVideo = '';
let currentKey = '';
function showStuck(show) {
  clearTimeout(stuckTimer);
  $('#player-stuck').hidden = !show;
  player.classList.toggle('is-stuck', show);
}

function loadVideo(vod) {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', enablejsapi: '1', origin: location.origin });
  if (vod.start) params.set('start', String(vod.start));
  const old = $('#player-iframe');
  const iframe = old.cloneNode(false);
  iframe.src = `https://www.youtube.com/embed/${vod.id}?${params}`;
  old.replaceWith(iframe);
  currentVideo = vod.id;
  ytPlayer = null;
  ytReady = false;
  showStuck(false);
  stuckTimer = setTimeout(() => showStuck(true), STUCK_MS);
  loadYouTubeApi()
    .then((YT) => {
      if (!iframe.isConnected) return;
      ytPlayer = new YT.Player(iframe, {
        events: {
          onReady: () => (ytReady = true),
          // 1: 再生中 / 3: 読み込み中 → 見られているので案内は出さない
          onStateChange: (e) => (e.data === 1 || e.data === 3) && showStuck(false),
          onError: () => showStuck(true),
        },
      });
    })
    .catch(() => {});
}

function renderPlayerInfo(it) {
  const { m, g } = it;
  const map = mapBySlug.get(g.map);
  const e = eventBySlug.get(m.event);
  const [t0, t1] = m.teams.map(teamOf);
  const hide = spoilerFree();
  $('#player-title').textContent = `${t0.name} vs ${t1.name} — MAP ${g.n} ${map.nameEn}（${map.name}）`;
  $('#player-sub').textContent = `${e.name} / ${m.series} / ${formatDate(m.date)}${hide ? '' : ` / シリーズ ${m.score[0]}–${m.score[1]}`}${
    g.vod.estimated ? ' / ※このマップの開始位置は推定です（数分ずれることがあります）' : ''
  }`;
  // 同じ試合の他のマップ（同じ動画なら頭出し、別の動画なら読み込み直す）
  $('#player-maps').innerHTML = m.games
    .map((x) => {
      const xm = mapBySlug.get(x.map);
      return `<button type="button" class="player-map" data-key="${m.id}-${x.n}" aria-pressed="${x.n === g.n}" style="--banner:url('${xm.banner}')">
        <span class="player-map-n">MAP ${x.n}</span>
        <span class="player-map-name">${esc(xm.nameEn)}</span>
        <span class="player-map-score">${hide ? (x.vod.start ? `▶ ${formatTime(x.vod.start)}` : '') : `${x.score[0]}–${x.score[1]}`}</span>
      </button>`;
    })
    .join('');
  // このマップの出場選手（押すとその選手・チームで絞り込む）
  $('#player-roster').innerHTML = [0, 1]
    .map((side) => {
      const t = teamOf(m.teams[side]);
      return `<div class="roster">
        <button type="button" class="roster-team" data-team="${esc(m.teams[side])}" title="${esc(t.name)}の試合で絞り込む">
          ${t.logo ? `<img src="${t.logo}" alt="" width="22" height="22">` : ''}<span>${esc(t.name)}</span>
        </button>
        <div class="roster-players">${g.players[side]
          .map(
            (p, k) => `<button type="button" class="roster-player" data-player="${esc(p)}" data-team-of="${esc(m.teams[side])}" aria-pressed="${state.player === p}" title="${esc(p)}の試合で絞り込む">
              ${agentIcon(g.comps[side][k], 22)}<span>${esc(p)}</span></button>`,
          )
          .join('')}</div>
      </div>`;
    })
    .join('');
  $('#player-link').href = youtubeUrl(g.vod);
  $('#player-stuck-link').href = youtubeUrl(g.vod);
  $('#player-vlr').href = `https://www.vlr.gg/${m.id}/?game=all`;
}

function openGame(key) {
  const it = itemByKey.get(key);
  if (!it) return;
  if (openMode === 'youtube') {
    window.open(youtubeUrl(it.g.vod), '_blank', 'noopener');
    return;
  }
  const sameVideo = player.open && currentVideo === it.g.vod.id && ytReady && ytPlayer?.seekTo;
  if (sameVideo) {
    ytPlayer.seekTo(it.g.vod.start, true);
    ytPlayer.playVideo?.();
  } else {
    loadVideo(it.g.vod);
  }
  currentKey = key;
  renderPlayerInfo(it);
  if (!player.open) player.showModal();
}
player.addEventListener('close', () => {
  showStuck(false);
  $('#player-iframe').src = 'about:blank';
  currentVideo = '';
  currentKey = '';
  ytPlayer = null;
  ytReady = false;
});
$('#player-maps').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-key]');
  if (btn && btn.dataset.key !== currentKey) openGame(btn.dataset.key);
});
$('#open-mode').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (btn) setOpenMode(btn.dataset.mode);
});
$('#always-youtube').addEventListener('change', (e) => setOpenMode(e.target.checked ? 'youtube' : 'site'));
setOpenMode(openMode);
player.addEventListener('click', (e) => e.target === player && player.close());
$('#player-close').addEventListener('click', () => player.close());

/* ---------- 横スクロール（マップ・大会・エージェントの一覧） ---------- */
// マウスのホイールでも横に送れるようにし、左右の矢印ボタンと端のフェードを付ける
for (const wrap of document.querySelectorAll('.scroller')) {
  const list = wrap.firstElementChild;
  wrap.insertAdjacentHTML(
    'beforeend',
    `<button type="button" class="scroll-btn scroll-prev" data-dir="-1" aria-label="左へスクロール" tabindex="-1"></button>
     <button type="button" class="scroll-btn scroll-next" data-dir="1" aria-label="右へスクロール" tabindex="-1"></button>`,
  );
  const update = () => {
    const max = list.scrollWidth - list.clientWidth;
    wrap.classList.toggle('can-prev', list.scrollLeft > 1);
    wrap.classList.toggle('can-next', list.scrollLeft < max - 1);
  };
  list.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(list);
  new MutationObserver(update).observe(list, { childList: true });
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.scroll-btn');
    if (btn) list.scrollBy({ left: btn.dataset.dir * list.clientWidth * 0.8, behavior: 'smooth' });
  });
  list.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // トラックパッドの横スワイプはそのまま
      const max = list.scrollWidth - list.clientWidth;
      // 端まで来たらページの縦スクロールに戻す
      if ((e.deltaY < 0 && list.scrollLeft <= 0) || (e.deltaY > 0 && list.scrollLeft >= max)) return;
      e.preventDefault();
      list.scrollLeft += e.deltaY;
    },
    { passive: false },
  );
}

/* ---------- イベント ---------- */
const reset = () => (state.limit = PAGE_SIZE);
$('#map-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-map]');
  if (!btn || btn.disabled || btn.dataset.map === state.map) return;
  state.map = btn.dataset.map;
  reset();
  render(true);
});
$('#event-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-event]');
  if (!btn || btn.disabled) return;
  state.event = btn.dataset.event === state.event ? ALL : btn.dataset.event;
  // 大会を選んだら、その大会の地域の絞り込みは外す（国際大会で地域が合わず 0 件になるのを防ぐ）
  if (state.event !== ALL) state.region = '';
  reset();
  render(true);
});
$('#region-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-region]');
  if (!btn) return;
  state.region = btn.dataset.region;
  if (state.event !== ALL && state.region && eventBySlug.get(state.event).region !== state.region) state.event = ALL;
  // ほかの地域のチーム・選手を選んでいたら外す
  if (state.region && state.team && teamRegion.get(state.team) !== state.region) state.team = '';
  if (state.region && state.player && teamRegion.get(playerTeam.get(state.player)) !== state.region) state.player = '';
  reset();
  render(true);
});
// 選んだチーム・選手の試合が今の条件で 0 件なら、大会 → マップの順に絞り込みを外す
function widenIfEmpty() {
  if (!filtered().length) state.event = ALL;
  if (!filtered().length) state.map = ALL;
}
$('#team-picks').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-team]');
  if (!btn) return;
  state.team = state.team === btn.dataset.team ? '' : btn.dataset.team;
  // 選んでいる選手がそのチームにいなければ外す
  if (state.team && state.player && playerTeam.get(state.player) !== state.team) state.player = '';
  if (state.team) state.region = '';
  widenIfEmpty();
  reset();
  render(true);
});
$('#team-clear').addEventListener('click', () => {
  state.team = '';
  state.player = '';
  reset();
  render(true);
});
$('#player-picks').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-player]');
  if (!btn) return;
  state.player = btn.dataset.player === state.player ? '' : btn.dataset.player;
  widenIfEmpty();
  reset();
  render(true);
});
// 出場選手・チームのボタン: プレーヤーを閉じて、その選手・チームの試合を並べる
$('#player-roster').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-player], [data-team]');
  if (!btn) return;
  // 選んでいるチーム・選手と合わない絞り込みは外す（相手チームの選手を押したときに 0 件近くにならないように）
  if (btn.dataset.player) {
    state.player = state.player === btn.dataset.player ? '' : btn.dataset.player;
    if (state.team && state.team !== btn.dataset.teamOf) state.team = '';
  } else {
    state.team = btn.dataset.team;
    if (state.player && playerTeam.get(state.player) !== state.team) state.player = '';
  }
  player.close();
  reset();
  render(true);
  $('#result-count').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
function toggleAgent(slug) {
  state.agents.has(slug) ? state.agents.delete(slug) : state.agents.add(slug);
  reset();
  render(true);
}
$('#agent-picks').addEventListener('click', (e) => {
  if (e.target.closest('[data-agent-clear]')) {
    state.agents.clear();
    reset();
    return render(true);
  }
  const btn = e.target.closest('[data-agent]');
  if (btn) toggleAgent(btn.dataset.agent);
});
$('#map-hero').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-agent]');
  if (btn) toggleAgent(btn.dataset.agent);
});
$('#spoiler-free').addEventListener('change', (e) => {
  try {
    localStorage.setItem(SPOILER_KEY, e.target.checked ? '1' : '0');
  } catch {}
  renderGrid();
  const it = itemByKey.get(currentKey);
  if (it) renderPlayerInfo(it);
});
$('#more').addEventListener('click', () => {
  state.limit += PAGE_SIZE;
  renderGrid();
});
$('#game-grid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-key]');
  if (card) openGame(card.dataset.key);
});
window.addEventListener('popstate', () => {
  readRoute();
  render();
});

/* ---------- 初期化 ---------- */
$('#header-stats').innerHTML = `<strong>${items.length}</strong> マップ ・ <strong>${data.matches.length}</strong> 試合 ・ <strong>${data.events.length}</strong> 大会`;
$('#footer-meta').textContent = `マップ・エージェント情報: valorant-api.com（${meta.gameVersion}）`;
readRoute();
render();
