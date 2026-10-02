// VCT のページ（/vct 以下）を _site/ に書き出す。scripts/build-site.mjs から呼ぶ
// - /vct/ascent・/vct/ascent/champions-2026・/vct/all/champions-2026 のようなページごとに index.html を作り、
//   タイトル・説明文・canonical・OGP・パンくずを入れる（テンプレートは vct.html）
// - 試合の一覧もリンクとして書き出しておく（JavaScript を実行しない検索エンジン向け。表示は vct/app.js が置き換える）
// - 書き出したページのパスを返す（sitemap.xml は build-site.mjs が定点のページとまとめて作る）
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { SITE, ALL, routePath, seoFor } from '../../assets/js/vct/seo.js';

const root = new URL('../../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const [meta, data, template] = await Promise.all([
  read('data/meta.json'),
  read('data/vct/matches.json'),
  readFile(new URL('vct.html', root), 'utf8'),
]);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mapBySlug = new Map(meta.maps.map((m) => [m.slug, m]));
const eventBySlug = new Map(data.events.map((e) => [e.slug, e]));
const teamOf = (id) => data.teams[id] ?? { name: id, tag: id };

const items = data.matches.flatMap((m) => m.games.map((g) => ({ m, g })));
const pick = (map, event) => items.filter((it) => (map === ALL || it.g.map === map) && (event === ALL || it.m.event === event));

// { map, event, items } のページ一覧
const pages = [];
for (const map of [ALL, ...meta.maps.map((m) => m.slug)]) {
  for (const event of [ALL, ...data.events.map((e) => e.slug)]) {
    const list = pick(map, event);
    if (list.length) pages.push({ map, event, items: list });
  }
}

function breadcrumb(page) {
  const crumbs = [
    { name: 'LINEUP ARCHIVE', path: '/' },
    { name: SITE.name, path: SITE.base },
  ];
  if (page.map !== ALL) crumbs.push({ name: mapBySlug.get(page.map).name, path: routePath({ map: page.map, event: ALL }) });
  if (page.event !== ALL) crumbs.push({ name: eventBySlug.get(page.event).name, path: routePath(page) });
  return crumbs;
}

function heading(page) {
  const map = mapBySlug.get(page.map);
  const event = eventBySlug.get(page.event);
  if (!map && !event) return 'VALORANT プロの試合をマップ別に見る';
  return `${event ? `${event.name} ` : ''}${map ? map.name : '全マップ'}の試合`;
}

const formatTime = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
function itemLink({ m, g }) {
  const [a, b] = m.teams.map(teamOf);
  const map = mapBySlug.get(g.map);
  const url = `https://www.youtube.com/watch?v=${g.vod.id}${g.vod.start ? `&t=${g.vod.start}s` : ''}`;
  return `<li><a href="${url}">${esc(a.name)} vs ${esc(b.name)} — MAP ${g.n} ${esc(map.nameEn)}</a>（${esc(eventBySlug.get(m.event).name)} / ${esc(m.series)}${g.vod.start ? ` / ${formatTime(g.vod.start)} から` : ''}）</li>`;
}

// ほかのマップ・大会のページへの導線（内部リンク）
function relatedLinks(page) {
  const maps = meta.maps
    .filter((m) => pages.some((p) => p.map === m.slug && p.event === page.event))
    .map((m) => `<a href="${routePath({ map: m.slug, event: page.event })}">${esc(m.name)}</a>`)
    .join(' ');
  const events = data.events
    .filter((e) => pages.some((p) => p.map === page.map && p.event === e.slug))
    .map((e) => `<a href="${routePath({ map: page.map, event: e.slug })}">${esc(e.name)}</a>`)
    .join(' ');
  return `<p class="prerender-links">マップ別: ${maps}</p><p class="prerender-links">大会別: ${events}</p>`;
}

function render(page) {
  const path = routePath(page);
  const url = SITE.url + path;
  const { title, description } = seoFor(page, data, meta, page.items.length);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumb(page).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE.url + c.path })),
  };
  const set = (html, re, value) => html.replace(re, (m, a, _old, b) => `${a}${value}${b}`);
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = set(html, /(<meta name="description" content=")([^"]*)(")/, esc(description));
  html = set(html, /(<meta property="og:title" content=")([^"]*)(")/, esc(title));
  html = set(html, /(<meta property="og:description" content=")([^"]*)(")/, esc(description));
  html = set(html, /(<meta property="og:url" content=")([^"]*)(")/, url);
  html = set(html, /(<link rel="canonical" href=")([^"]*)(")/, url);
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`);
  html = html.replace(
    '<section class="map-hero" id="map-hero" aria-live="polite"></section>',
    `<section class="map-hero" id="map-hero" aria-live="polite"><div class="hero-body"><h1 class="hero-name hero-name-static">${esc(heading(page))}</h1><p class="hero-desc">${esc(description)}</p></div></section>`,
  );
  html = html.replace(
    '<section class="game-grid" id="game-grid"></section>',
    `<section class="game-grid" id="game-grid">${relatedLinks(page)}<ul class="prerender">${page.items.slice(0, 200).map(itemLink).join('')}</ul></section>`,
  );
  return { path, html };
}

export async function buildVctPages(out) {
  await mkdir(new URL('data/vct/', out), { recursive: true });
  await cp(new URL('data/vct/matches.json', root), new URL('data/vct/matches.json', out));
  const paths = [];
  for (const page of pages) {
    const { path, html } = render(page);
    const dir = new URL(`.${path}/`, out);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL('index.html', dir), html);
    paths.push(path);
  }
  return paths;
}
