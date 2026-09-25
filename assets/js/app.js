const TAGS = {
  attack: '攻め',
  defense: '守り',
  postplant: '設置後',
  retake: 'リテイク',
  oneway: 'ワンウェイ',
  setup: 'セットアップ',
  molly: 'モロトフ',
};
// エージェント別とは別に、横断して見られる特集
const FEATURES = {
  molly: {
    title: 'MOLLY LINEUPS',
    name: 'モロトフ定点',
    desc: 'ブリムストーンのインセンディアリー、ヴァイパーのスネークバイト、キルジョイのナノスワーム、KAY/O のフラグ/メントなど、設置後の解除阻止や遅延に使う空爆系の定点をエージェント横断でまとめています。',
    match: (v) => v.tags.includes('molly'),
  },
  shorts: {
    title: 'SHORTS',
    name: 'ショート定点',
    desc: '1 本あたり数十秒で立ち位置と照準だけをサクッと確認できる、YouTube ショートの定点動画です。',
    match: (v) => v.short,
  },
  posts: {
    title: 'X POSTS',
    name: 'X ポスト',
    desc: 'X（旧 Twitter）に投稿された定点のクリップ（動画付きのポストのみ）です。動画より短く、立ち位置と照準だけを手早く確認できます。カードを押すとポストをその場で表示します。',
    items: () => posts,
  },
};
const itemsOf = (key) => FEATURES[key].items?.() ?? videos.filter(FEATURES[key].match);
const unit = () => (state.view === 'posts' ? '件' : '本');
const ROLE_LABEL = { Initiator: 'INITIATOR', Controller: 'CONTROLLER', Sentinel: 'SENTINEL', Duelist: 'DUELIST' };
const ALL = 'all';

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const [meta, videos, posts] = await Promise.all([
  fetch('data/meta.json').then((r) => r.json()),
  fetch('data/videos.json').then((r) => r.json()),
  // X ポストはまだ無い場合もあるので失敗しても空で続ける
  fetch('data/posts.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
]);
for (const v of videos) v.search = `${v.title} ${v.channel}`.toLowerCase();
for (const p of posts) p.search = `${p.text} ${p.author} @${p.handle}`.toLowerCase();

const agentBySlug = new Map(meta.agents.map((a) => [a.slug, a]));
const mapBySlug = new Map(meta.maps.map((m) => [m.slug, m]));

const countByAgent = new Map();
for (const v of videos) for (const a of v.agents) countByAgent.set(a, (countByAgent.get(a) ?? 0) + 1);

// 動画かポストが 1 件以上あるエージェントだけタブに出す
const agents = meta.agents.filter((a) => countByAgent.has(a.slug) || posts.some((p) => p.agents.includes(a.slug)));
const agentSlugs = new Set(agents.map((a) => a.slug));

// view: 'agent'（エージェント別）または FEATURES のキー。特集では agent に ALL（全エージェント）も入る
const state = { view: 'agent', agent: agents[0].slug, map: ALL, tags: new Set(), lang: '', query: '' };

const isMap = (map) => mapBySlug.has(map) || map === 'multi';
// 横スクロール一覧の中で、選択中のタブが見える位置まで送る（ページ自体は動かさない）
function revealSelected(list) {
  const el = list.querySelector('[aria-selected="true"]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const box = list.getBoundingClientRect();
  if (r.left < box.left) list.scrollLeft += r.left - box.left - 40;
  else if (r.right > box.right) list.scrollLeft += r.right - box.right + 40;
}
const featureVideos = () => (state.view === 'agent' ? videos : itemsOf(state.view));

/* ---------- ルーティング: #/<agent>/<map> または #/<feature>/<map>/<agent> ---------- */
function readHash() {
  const [first, map, agent] = location.hash.replace(/^#\/?/, '').split('/');
  if (FEATURES[first]) {
    state.view = first;
    state.agent = featureVideos().some((v) => v.agents.includes(agent)) ? agent : ALL;
  } else {
    state.view = 'agent';
    state.agent = agentSlugs.has(first) ? first : agents[0].slug;
  }
  state.map = isMap(map) ? map : ALL;
}
function writeHash() {
  const parts =
    state.view === 'agent'
      ? [state.agent, state.map === ALL ? '' : state.map]
      : [state.view, state.map === ALL && state.agent === ALL ? '' : state.map, state.agent === ALL ? '' : state.agent];
  const hash = `#/${parts.filter(Boolean).join('/')}`.replace(/\/$/, '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

/* ---------- 描画 ---------- */
function renderViewTabs() {
  const tab = (view, label, n) =>
    `<button type="button" class="view-tab" role="tab" data-view="${view}" aria-selected="${state.view === view}">${label}<span class="view-tab-count">${n}</span></button>`;
  $('#view-tabs').innerHTML = [
    tab('agent', 'エージェント別', videos.length),
    ...Object.keys(FEATURES).map((key) => tab(key, FEATURES[key].name, itemsOf(key).length)),
  ].join('');
}

function renderAgentRail() {
  const pool = featureVideos();
  const count = new Map();
  for (const v of pool) for (const a of v.agents) count.set(a, (count.get(a) ?? 0) + 1);
  // エージェント別ではポストしかないエージェントも 0 本で出す
  if (state.view === 'agent') for (const a of agents) if (!count.has(a.slug)) count.set(a.slug, 0);
  const groups = Map.groupBy(
    agents.filter((a) => count.has(a.slug)),
    (a) => a.role,
  );
  const all =
    state.view === 'agent'
      ? ''
      : `<div class="role-group">
          <p class="role-label">ALL</p>
          <div class="role-agents" role="tablist">
            <button type="button" class="agent-tab agent-tab-all" role="tab" data-agent="${ALL}" aria-selected="${state.agent === ALL}">
              <span class="agent-tab-all-mark">ALL</span>
              <span class="agent-tab-name">全員</span>
              <span class="agent-tab-count">${pool.length} ${unit()}</span>
            </button>
          </div>
        </div>`;
  const rail = $('#agent-rail');
  const scroll = rail.scrollLeft;
  rail.innerHTML = all + [...groups]
    .map(
      ([role, list]) => `
      <div class="role-group">
        <p class="role-label">${ROLE_LABEL[role] ?? esc(role)}</p>
        <div class="role-agents" role="tablist">
          ${list
            .map(
              (a) => `
            <button type="button" class="agent-tab" role="tab" data-agent="${a.slug}" aria-selected="${a.slug === state.agent}">
              <img src="${a.icon}" alt="" width="48" height="48" loading="lazy">
              <span class="agent-tab-name">${esc(a.name)}</span>
              <span class="agent-tab-count">${count.get(a.slug)} ${unit()}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>`,
    )
    .join('');
  rail.scrollLeft = scroll;
  revealSelected(rail);
}

function renderHero() {
  const hero = $('#agent-hero');
  hero.classList.toggle('is-feature', state.view !== 'agent');
  if (state.view !== 'agent') {
    const f = FEATURES[state.view];
    const a = agentBySlug.get(state.agent);
    hero.style.setProperty('--g1', a?.gradient[0] ?? 'var(--red-dark)');
    hero.style.setProperty('--g2', a ? a.gradient[2] ?? a.gradient[1] : 'var(--navy-3)');
    hero.innerHTML = `
      <div class="hero-body">
        <p class="hero-role">FEATURE / 特集</p>
        <h1 class="hero-name">${f.title}</h1>
        <p class="hero-name-ja">${esc(f.name)}${a ? `（${esc(a.name)}）` : ''}</p>
        <p class="hero-desc">${esc(f.desc)}</p>
      </div>
      ${a ? `<img class="hero-portrait" src="${a.portrait}" alt="">` : ''}`;
    return;
  }
  const a = agentBySlug.get(state.agent);
  hero.style.setProperty('--g1', a.gradient[0]);
  hero.style.setProperty('--g2', a.gradient[2] ?? a.gradient[1]);
  hero.innerHTML = `
    <div class="hero-body">
      <p class="hero-role">${esc(a.roleName)} / ${esc(a.role.toUpperCase())}</p>
      <h1 class="hero-name">${esc(a.nameEn)}</h1>
      <p class="hero-name-ja">${esc(a.name)} のスキル定点</p>
      <ul class="abilities">
        ${a.abilities
          .map(
            (ab) => `<li class="ability"><img src="${ab.icon}" alt="" width="26" height="26"><span class="ability-key">${ab.key}</span><span>${esc(ab.name)}</span></li>`,
          )
          .join('')}
      </ul>
    </div>
    <img class="hero-portrait" src="${a.portrait}" alt="">`;
}

// 表示中のビュー・エージェントに当てはまる動画（マップ以降の絞り込み前）
const matchesAgent = (v) => state.agent === ALL || v.agents.includes(state.agent);
const matchesMap = (v) => state.map === ALL || v.maps.includes(state.map === 'multi' ? ALL : state.map);

function renderMapTabs() {
  const agentVideos = featureVideos().filter(matchesAgent);
  const count = (slug) => agentVideos.filter((v) => v.maps.includes(slug)).length;
  const multi = count(ALL);

  const tab = (m) => {
    const n = count(m.slug);
    return `
      <button type="button" class="map-tab" role="tab" data-map="${m.slug}" aria-selected="${m.slug === state.map}"
        style="--banner:url('${m.banner}')" ${n ? '' : 'disabled'}>
        ${m.inPool ? '<span class="map-tab-pool">POOL</span>' : ''}
        <span class="map-tab-name">${esc(m.nameEn)}</span>
        <span class="map-tab-sub">${esc(m.name)}・${n} ${unit()}</span>
      </button>`;
  };

  const pool = meta.maps.filter((m) => m.inPool);
  const others = meta.maps.filter((m) => !m.inPool);
  $('#map-tabs').innerHTML = `
    <button type="button" class="map-tab map-tab-all" role="tab" data-map="${ALL}" aria-selected="${state.map === ALL}">
      <span class="map-tab-name">ALL</span>
      <span class="map-tab-sub">${agentVideos.length} ${unit()}</span>
    </button>
    ${pool.map(tab).join('')}
    <span class="map-divider" aria-hidden="true"></span>
    ${others.map(tab).join('')}
    ${
      multi
        ? `<button type="button" class="map-tab" role="tab" data-map="multi" aria-selected="${state.map === 'multi'}">
            <span class="map-tab-name">MULTI</span><span class="map-tab-sub">複数マップ・${multi} ${unit()}</span>
          </button>`
        : ''
    }`;
  revealSelected($('#map-tabs'));
}

function currentVideos() {
  const q = state.query.trim().toLowerCase();
  return featureVideos().filter((v) => {
    if (!matchesAgent(v) || !matchesMap(v)) return false;
    if (state.lang && v.lang !== state.lang) return false;
    if ([...state.tags].some((t) => !v.tags.includes(t))) return false;
    if (q && !v.search.includes(q)) return false;
    return true;
  });
}

function renderTagChips() {
  // タグの件数はタグ以外の条件で絞った結果に対して数える
  const base = featureVideos().filter((v) => matchesAgent(v) && matchesMap(v));
  $('#tag-chips').innerHTML = Object.entries(TAGS)
    .map(([tag, label]) => {
      if (state.view === 'molly' && tag === 'molly') return '';
      const n = base.filter((v) => v.tags.includes(tag)).length;
      if (!n && !state.tags.has(tag)) return '';
      return `<button type="button" class="chip" data-tag="${tag}" aria-pressed="${state.tags.has(tag)}">${label}<span class="chip-count">${n}</span></button>`;
    })
    .join('');
}

const mapBadgesOf = (item) =>
  state.map === ALL || state.map === 'multi'
    ? item.maps.map((m) => `<span class="badge badge-map">${m === ALL ? '複数マップ' : esc(mapBySlug.get(m).name)}</span>`).join('')
    : '';
const agentIconsOf = (item) =>
  item.agents
    .filter((a) => a !== state.agent || state.view !== 'agent')
    .map((a) => agentBySlug.get(a))
    .filter(Boolean)
    .map((a) => `<img src="${a.icon}" alt="${esc(a.name)}" title="${esc(a.name)}" width="20" height="20" loading="lazy">`)
    .join('');

const formatDuration = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function postCard(p) {
  const icons = agentIconsOf(p);
  // サムネイルが消えている（ポスト削除など）ときは枠ごと隠す
  const thumb = p.thumb
    ? `<div class="thumb post-thumb${p.vertical ? ' is-vertical' : ''}">
        <img src="${p.thumb}?name=small" alt="" loading="lazy" width="320" height="180" onerror="this.parentElement.remove()">
        ${p.duration ? `<span class="badge post-duration">${formatDuration(p.duration)}</span>` : ''}
      </div>`
    : '';
  return `
    <button type="button" class="post-card" data-post="${p.id}">
      ${thumb}
      <div class="post-head">
        <span class="post-logo" aria-hidden="true">𝕏</span>
        <span class="post-author">${esc(p.author)}</span>
        <span class="post-handle">@${esc(p.handle)}</span>
        ${p.date ? `<time class="post-date" datetime="${p.date}">${p.date.replaceAll('-', '/')}</time>` : ''}
      </div>
      <p class="post-text">${esc(p.text)}</p>
      <div class="post-foot">
        ${mapBadgesOf(p)}
        ${p.tags.map((t) => `<span class="tag">${TAGS[t]}</span>`).join('')}
        ${icons ? `<span class="card-agents">${icons}</span>` : ''}
      </div>
    </button>`;
}

// エージェント別の表示で、動画の下に同じエージェント・マップの X ポストを並べる
const POST_PREVIEW = 6;
function renderPostSection() {
  const section = $('#post-section');
  const list =
    state.view === 'agent'
      ? posts.filter((p) => matchesAgent(p) && matchesMap(p) && (!state.lang || p.lang === state.lang))
      : [];
  section.hidden = !list.length;
  if (!list.length) return;
  section.innerHTML = `
    <div class="section-head">
      <h2 class="section-title"><span aria-hidden="true">𝕏</span> X のポスト<span class="section-count">${list.length} 件</span></h2>
      ${list.length > POST_PREVIEW ? '<button type="button" class="btn btn-ghost" data-view-posts>すべて見る</button>' : ''}
    </div>
    <div class="post-grid">${list.slice(0, POST_PREVIEW).map(postCard).join('')}</div>`;
}

function renderGrid() {
  const list = currentVideos();
  const agentLabel = state.agent === ALL ? '全エージェント' : agentBySlug.get(state.agent).name;
  const mapLabel = state.map === ALL ? '全マップ' : state.map === 'multi' ? '複数マップ' : mapBySlug.get(state.map).name;
  const prefix = state.view === 'agent' ? '' : `${FEATURES[state.view].name}：`;
  $('#result-count').innerHTML = `${esc(prefix + agentLabel)} × ${esc(mapLabel)}：<strong>${list.length}</strong> ${unit()}`;
  const grid = $('#video-grid');
  grid.classList.toggle('is-shorts', state.view === 'shorts');
  grid.classList.toggle('is-posts', state.view === 'posts');

  if (!list.length) {
    grid.innerHTML = `<p class="empty">条件に合う${state.view === 'posts' ? 'ポスト' : '動画'}がありません。絞り込みを変えてみてください。</p>`;
    return;
  }
  if (state.view === 'posts') {
    grid.innerHTML = list.map(postCard).join('');
    return;
  }

  grid.innerHTML = list
    .map((v) => {
      const mapBadges = mapBadgesOf(v);
      const others = agentIconsOf(v);
      return `
        <button type="button" class="video-card" data-id="${v.id}">
          <div class="thumb">
            <img src="https://i.ytimg.com/vi/${v.id}/${state.view === 'shorts' ? 'hqdefault' : 'mqdefault'}.jpg" alt="" loading="lazy" width="320" height="180">
            <div class="thumb-badges">${mapBadges}<span class="badge">${v.lang === 'ja' ? 'JP' : 'EN'}</span>${v.short && state.view !== 'shorts' ? '<span class="badge badge-short">SHORT</span>' : ''}</div>
          </div>
          <div class="card-body">
            <h3 class="card-title">${esc(v.title)}</h3>
            ${v.tags.length ? `<div class="card-tags">${v.tags.map((t) => `<span class="tag">${TAGS[t]}</span>`).join('')}</div>` : ''}
            <div class="card-meta">
              <span class="card-channel">${esc(v.channel)}</span>
              ${others ? `<span class="card-agents">${others}</span>` : ''}
            </div>
          </div>
        </button>`;
    })
    .join('');
}

function render() {
  writeHash();
  renderViewTabs();
  renderAgentRail();
  renderHero();
  renderMapTabs();
  renderTagChips();
  renderGrid();
  renderPostSection();
  $('#search').placeholder = state.view === 'posts' ? '本文・アカウントで検索' : 'タイトル・チャンネルで検索';
  const a = agentBySlug.get(state.agent);
  const heading = state.view === 'agent' ? `${a.name} のスキル定点` : `${FEATURES[state.view].name}${a ? `（${a.name}）` : ''}`;
  document.title = `${heading} | VALORANT スキル定点アーカイブ`;
}

/* ---------- プレイヤー ---------- */
const player = $('#player');
function openPlayer(id) {
  const v = videos.find((x) => x.id === id);
  $('#player-iframe').src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  $('#player-title').textContent = v.title;
  $('#player-channel').textContent = v.channel;
  $('#player-link').href = v.short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
  player.classList.toggle('is-short', v.short);
  player.showModal();
}
player.addEventListener('close', () => ($('#player-iframe').src = 'about:blank'));
player.addEventListener('click', (e) => e.target === player && player.close());
$('#player-close').addEventListener('click', () => player.close());

/* ---------- X ポストの表示 ---------- */
// X 公式の埋め込み（widgets.js）は開いたときに初めて読み込む。読めない環境では保存済みの本文を出す
const postViewer = $('#post-viewer');
let widgets;
const loadWidgets = () =>
  (widgets ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: 'https://platform.twitter.com/widgets.js', async: true });
    script.onload = () => window.twttr.ready(resolve);
    script.onerror = reject;
    document.head.append(script);
  }));

async function openPost(id) {
  const p = posts.find((x) => x.id === id);
  const url = `https://x.com/${p.handle}/status/${p.id}`;
  const box = $('#post-embed');
  box.innerHTML = `<div class="post-fallback">${postCard(p)}<p class="post-loading">ポストを読み込み中…</p></div>`;
  $('#post-link').href = url;
  postViewer.showModal();
  try {
    const twttr = await loadWidgets();
    // widgets.js はページ上にある要素にしか描画しないので、先に置いてから読み込む
    const el = Object.assign(document.createElement('div'), { className: 'post-tweet' });
    box.append(el);
    const tweet = await twttr.widgets.createTweet(id, el, { theme: 'dark', lang: 'ja', dnt: true, align: 'center' });
    if (!tweet) throw new Error('not found');
    box.querySelector('.post-fallback')?.remove();
  } catch {
    box.querySelector('.post-loading')?.replaceWith(
      Object.assign(document.createElement('p'), { className: 'post-loading', textContent: 'ポストを埋め込めませんでした。「X で開く」から見てください。' }),
    );
  }
}
postViewer.addEventListener('close', () => $('#post-embed').replaceChildren());
postViewer.addEventListener('click', (e) => e.target === postViewer && postViewer.close());
$('#post-close').addEventListener('click', () => postViewer.close());

/* ---------- 横スクロール（エージェント・マップの一覧） ---------- */
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
$('#view-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn || btn.dataset.view === state.view) return;
  const prev = state.agent;
  state.view = btn.dataset.view;
  // 選んでいたエージェントを引き継ぐ（特集に動画がなければ全員 / 先頭のエージェント）
  state.agent = featureVideos().some((v) => v.agents.includes(prev)) ? prev : state.view === 'agent' ? agents[0].slug : ALL;
  state.map = ALL;
  state.tags.clear();
  render();
});

$('#agent-rail').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-agent]');
  if (!btn || btn.dataset.agent === state.agent) return;
  state.agent = btn.dataset.agent;
  // 同じマップに動画があればマップタブを維持する
  if (!featureVideos().some((v) => matchesAgent(v) && matchesMap(v))) state.map = ALL;
  state.tags.clear();
  render();
});

$('#map-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-map]');
  if (!btn || btn.disabled) return;
  state.map = btn.dataset.map;
  state.tags.clear();
  render();
});

$('#tag-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  const { tag } = btn.dataset;
  state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag);
  renderTagChips();
  renderGrid();
});

$('#lang-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-lang]');
  if (!btn) return;
  state.lang = btn.dataset.lang;
  document.querySelectorAll('#lang-filter button').forEach((b) => b.setAttribute('aria-pressed', b === btn));
  renderGrid();
});

$('#search').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderGrid();
});

$('#video-grid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-id]');
  if (card) openPlayer(card.dataset.id);
  const post = e.target.closest('[data-post]');
  if (post) openPost(post.dataset.post);
});

$('#post-section').addEventListener('click', (e) => {
  const post = e.target.closest('[data-post]');
  if (post) openPost(post.dataset.post);
  if (e.target.closest('[data-view-posts]')) {
    state.view = 'posts';
    state.tags.clear();
    render();
    $('#view-tabs').scrollIntoView({ behavior: 'smooth' });
  }
});

window.addEventListener('hashchange', () => {
  readHash();
  render();
});

/* ---------- 初期化 ---------- */
$('#header-stats').innerHTML = `<strong>${videos.length}</strong> 本${posts.length ? ` ・ <strong>${posts.length}</strong> ポスト` : ''} ・ <strong>${agents.length}</strong> エージェント`;
$('#footer-meta').textContent = `エージェント・マップ情報: valorant-api.com（${meta.gameVersion}）`;
readHash();
render();
