// 公開用のサイトを _site/ に書き出す（Vercel のビルドで実行）。使い方: node scripts/build-site.mjs
// - /sova/ascent のようなページごとに index.html を作り、タイトル・説明文・canonical・OGP・パンくずを入れる
// - 動画の一覧もリンクとして書き出しておく（JavaScript を実行しない検索エンジン向け。表示は app.js が置き換える）
// - sitemap.xml と robots.txt も作る
// - static/ の中身（Google Search Console の確認ファイルなど）はそのままサイトのルートに置く
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { SITE, ALL, FEATURE_NAMES, routePath, seoFor, setupAgentsOf, lineupTerm } from '../assets/js/seo.js';

const root = new URL('../', import.meta.url);
const out = new URL('_site/', root);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const [meta, videos, posts, template] = await Promise.all([
  read('data/meta.json'),
  read('data/videos.json'),
  read('data/posts.json').catch(() => []),
  readFile(new URL('index.html', root), 'utf8'),
]);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const agentBySlug = new Map(meta.agents.map((a) => [a.slug, a]));
const setupAgents = setupAgentsOf(meta, videos);
const mapBySlug = new Map(meta.maps.map((m) => [m.slug, m]));

const FEATURE_ITEMS = {
  pro: videos.filter((v) => v.creator || v.pro),
  molly: videos.filter((v) => v.tags.includes('molly')),
  shorts: videos.filter((v) => v.short),
  posts,
};

// app.js と同じく、動画かポストが 1 件以上あるエージェントだけ
const agents = meta.agents.filter((a) => [...videos, ...posts].some((v) => v.agents.includes(a.slug)));

// { view, agent, map, items, home? } のページ一覧
const pages = [];
const byMap = (items, map) => (map === ALL ? items : items.filter((v) => v.maps.includes(map)));
pages.push({ view: 'agent', agent: agents[0].slug, map: ALL, home: true, items: videos.filter((v) => v.agents.includes(agents[0].slug)) });
for (const a of agents) {
  const own = videos.filter((v) => v.agents.includes(a.slug));
  pages.push({ view: 'agent', agent: a.slug, map: ALL, items: own });
  for (const m of meta.maps) {
    const items = byMap(own, m.slug);
    if (items.length) pages.push({ view: 'agent', agent: a.slug, map: m.slug, items });
  }
}
for (const [view, all] of Object.entries(FEATURE_ITEMS)) {
  if (!all.length) continue;
  pages.push({ view, agent: ALL, map: ALL, items: all });
  for (const m of meta.maps) {
    const items = byMap(all, m.slug);
    if (items.length) pages.push({ view, agent: ALL, map: m.slug, items });
  }
}

function breadcrumb(page) {
  const crumbs = [{ name: SITE.name, path: '/' }];
  if (page.home) return crumbs;
  if (page.view === 'agent') {
    crumbs.push({ name: agentBySlug.get(page.agent).name, path: routePath({ ...page, map: ALL }) });
  } else {
    crumbs.push({ name: FEATURE_NAMES[page.view], path: routePath({ ...page, map: ALL }) });
  }
  if (page.map !== ALL) crumbs.push({ name: mapBySlug.get(page.map).name, path: routePath(page) });
  return crumbs;
}

function heading(page) {
  if (page.home) return 'VALORANT 定点・セットアップまとめ';
  const where = page.map === ALL ? '' : ` ${mapBySlug.get(page.map).name}`;
  if (page.view === 'agent') return `${agentBySlug.get(page.agent).name}${where}の${lineupTerm(page.agent, setupAgents)}`;
  return `${FEATURE_NAMES[page.view]}${where}`;
}

function itemLink(item) {
  if (item.handle) {
    const text = item.text.split('\n')[0].slice(0, 80);
    return `<li><a href="https://x.com/${esc(item.handle)}/status/${item.id}">${esc(text)}</a>（@${esc(item.handle)}）</li>`;
  }
  return `<li><a href="https://www.youtube.com/watch?v=${item.id}">${esc(item.title)}</a>（${esc(item.channel)}）</li>`;
}

// 同じページの中でリンクする: ほかのマップ・エージェントへの導線（内部リンク）
function relatedLinks(page) {
  if (page.view !== 'agent' || page.home) return '';
  const maps = meta.maps
    .filter((m) => pages.some((p) => p.view === 'agent' && p.agent === page.agent && p.map === m.slug))
    .map((m) => `<a href="${routePath({ ...page, map: m.slug })}">${esc(m.name)}</a>`)
    .join(' / ');
  return maps ? `<p class="prerender-links">${esc(agentBySlug.get(page.agent).name)}のマップ別: ${maps}</p>` : '';
}

function render(page) {
  const path = page.home ? '/' : routePath(page);
  const url = SITE.url + path;
  const { title, description } = seoFor(page, meta, page.items.length, setupAgents);
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
    '<section class="agent-hero" id="agent-hero" aria-live="polite"></section>',
    `<section class="agent-hero" id="agent-hero" aria-live="polite"><div class="hero-body"><h1 class="hero-name hero-name-static">${esc(heading(page))}</h1><p class="hero-desc">${esc(description)}</p></div></section>`,
  );
  html = html.replace(
    '<section class="video-grid" id="video-grid"></section>',
    `<section class="video-grid" id="video-grid">${relatedLinks(page)}<ul class="prerender">${page.items.map(itemLink).join('')}</ul></section>`,
  );
  return { path, html };
}

await rm(out, { recursive: true, force: true });
await mkdir(new URL('data/', out), { recursive: true });
await cp(new URL('assets/', root), new URL('assets/', out), { recursive: true });
await cp(new URL('static/', root), out, { recursive: true }).catch(() => {});
for (const f of ['meta.json', 'videos.json', 'posts.json']) await cp(new URL(`data/${f}`, root), new URL(`data/${f}`, out));

const paths = [];
for (const page of pages) {
  const { path, html } = render(page);
  const dir = new URL(`.${path}/`.replace('//', '/'), out);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html);
  paths.push(path);
}

const today = new Date().toISOString().slice(0, 10);
const priority = (p) => (p === '/' ? '1.0' : p.split('/').length === 2 ? '0.8' : '0.6');
await writeFile(
  new URL('sitemap.xml', out),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${SITE.url}${p}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${priority(p)}</priority></url>`)
    .join('\n')}\n</urlset>\n`,
);
await writeFile(new URL('robots.txt', out), `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
console.log(`_site: ${paths.length} ページ`);
