// vlr.gg の VCT のページ（https://www.vlr.gg/vct-2026 など）から大会を読み取り、サイトで使う形にする
// （scripts/vct/discover-events.mjs で使う。テストは test/vct/events.test.mjs）

const REGIONS = ['americas', 'emea', 'pacific', 'china'];
const REGION_NAMES = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const title = (s) => s.replace(/(^|-)(\w)/g, (_, sep, c) => `${sep ? ' ' : ''}${c.toUpperCase()}`);

// ページの大会カード → [{ id, vlrSlug, title, status, dates }]
export function parseVctPage(html) {
  const out = [];
  const re = /<a class="wf-card mod-flex event-item" href="\/event\/(\d+)\/([^"]+)"[\s\S]*?<\/a>/g;
  for (const [card, id, vlrSlug] of html.matchAll(re)) {
    out.push({
      id: Number(id),
      vlrSlug,
      title: card.match(/event-item-title">\s*([^<]+?)\s*</)?.[1] ?? '',
      status: card.match(/event-item-desc-item-status[^>]*>\s*(\w+)/)?.[1] ?? '',
      dates: card.match(/mod-dates">\s*([^<]+?)\s*</)?.[1] ?? '',
    });
  }
  return out;
}

// 'Sep 24—Oct 19' と年 → '2026-09-24'（読めなければ ''）
export function startDateOf(dates, year) {
  const m = dates.match(/^([A-Za-z]{3})\w*\s+(\d{1,2})/);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return month < 0 ? '' : `${year}-${String(month + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

// vlr.gg の大会 → scripts/vct/events.mjs の EVENTS と同じ形。知らない形の大会（Ascension など）は null
//   vct-2027-pacific-stage-1      → pacific-stage1-2027 / VCT 2027 Pacific Stage 1
//   valorant-masters-tokyo-2027   → masters-tokyo-2027 / Masters Tokyo 2027
//   valorant-champions-2027       → champions-2027 / VALORANT Champions 2027
export function eventFromVlr({ id, vlrSlug, dates = '' }, year) {
  const start = startDateOf(dates, year);
  const league = vlrSlug.match(new RegExp(`^vct-${year}-(${REGIONS.join('|')})-(kickoff|stage-\\d+)$`));
  if (league) {
    const [, region, stage] = league;
    const short = `${REGION_NAMES[region]} ${title(stage)}`;
    return { id, slug: `${region}-${stage.replace('-', '')}-${year}`, year, region, name: `VCT ${year} ${short}`, short, start };
  }
  const masters = vlrSlug.match(new RegExp(`^valorant-masters-([a-z-]+)-${year}$`));
  if (masters) {
    const short = `Masters ${title(masters[1])}`;
    return { id, slug: `masters-${masters[1]}-${year}`, year, region: 'international', name: `${short} ${year}`, short, start };
  }
  if (vlrSlug === `valorant-champions-${year}`) {
    return { id, slug: `champions-${year}`, year, region: 'international', name: `VALORANT Champions ${year}`, short: 'Champions', start };
  }
  return null;
}
