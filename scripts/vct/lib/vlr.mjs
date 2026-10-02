// vlr.gg の HTML から試合の情報を読み取る（scripts/vct/fetch-matches.mjs で使う。テストは test/vct/vlr.test.mjs）
export const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
export const text = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// 大会の試合一覧（/event/matches/<id>/?series_id=all）の HTML から、試合ページの URL と終了済みかどうかを読む
export function parseEventMatches(html) {
  const paths = [...html.matchAll(/<a href="(\/\d{5,7}\/[^"]+)" class="[^"]*match-item[^"]*">([\s\S]*?)<\/a>/g)].map(
    ([, path, body]) => ({ path, done: /ml-status">\s*Completed/.test(body) }),
  );
  return [...new Map(paths.map((p) => [p.path, p])).values()];
}

// meta（data/meta.json）のマップ・エージェント名に合わせて読み取る関数を作る。
// 知らない名前（新マップ・新エージェント）は unknown に入れる
export function createParser(meta) {
  const mapSlugOf = new Map(meta.maps.map((m) => [m.nameEn.toLowerCase(), m.slug]));
  // vlr.gg のエージェント名（画像のファイル名）→ data/meta.json の slug
  const agentSlugs = new Set(meta.agents.map((a) => a.slug));
  const AGENT_ALIASES = { 'kay/o': 'kayo' };
  const unknown = new Set();
  function agentSlug(name) {
    const s = AGENT_ALIASES[name] ?? name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!agentSlugs.has(s)) unknown.add(`agent:${name}`);
    return s;
  }

  function parseVods(html) {
    return [
      ...html.matchAll(
        /<div class="sm-vod[^"]*" data-site="(\w+)"><div class="sm-body([^>]*)>(?:<span class="sm-vod-num">(\d+)<\/span>)?<span class="sm-vod-name">([^<]*)<\/span>/g,
      ),
    ].map(([, site, attrs, num, name]) => ({
      site,
      id: attrs.match(/data-site-id="([^"]+)"/)?.[1] ?? '',
      start: Number(attrs.match(/data-embed-start="(\d+)"/)?.[1] ?? 0),
      num: num ? Number(num) : null,
      name: decode(name).trim(),
    }));
  }

  function parsePlayers(chunk) {
    return [...chunk.matchAll(/<div class="ovw-row">([\s\S]*?)(?=<div class="ovw-row">|$)/g)]
      .map(([, row]) => {
        const name = row.match(/ovw-player-name[^>]*>([^<]*)</)?.[1];
        if (!name) return null;
        return {
          name: decode(name).trim(),
          tag: decode(row.match(/ovw-player-tag[^>]*>([^<]*)</)?.[1] ?? '').trim(),
          agent: agentSlug(row.match(/agents\/[^"]+\.png" alt="([^"]+)"/)?.[1] ?? ''),
        };
      })
      .filter(Boolean);
  }

  function parseMatch(html, path) {
    const head = html.slice(html.indexOf('match-header-super'), html.indexOf('match-header-vs-score') + 6000);
    const event = text(head.match(/class="match-header-event"[\s\S]*?<div style="font-weight: 700;">([\s\S]*?)<\/div>/)?.[1] ?? '');
    const series = text(head.match(/match-header-event-series">([\s\S]*?)<\/div>/)?.[1] ?? '');
    const utc = head.match(/data-utc-ts="([^"]+)"/)?.[1] ?? '';
    const patch = text(head.match(/Patch ([\d.]+)/)?.[0] ?? '');
    const teams = [1, 2].map((n) => {
      const block = head.match(new RegExp(`match-header-link wf-link-hover mod-${n}"\\s*href="([^"]*)"[\\s\\S]*?</a>`));
      return {
        name: text(block?.[0].match(/wf-title-med[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''),
        vlr: block?.[1] ?? '',
        logo: (block?.[0].match(/<img src="([^"]+)"/)?.[1] ?? '').replace(/^\/\//, 'https://'),
      };
    });
    const scoreSpans = [...(head.match(/<div class="sp-hide">([\s\S]*?)<\/div>/)?.[1] ?? '').matchAll(/match-header-vs-score-(?:winner|loser)">\s*(\d+)/g)];
    const score = scoreSpans.map((m) => Number(m[1]));
    const bestOf = head.match(/match-header-vs-note">\s*(Bo\d)/)?.[1] ?? '';

    const vods = parseVods(html);
    const chunks = html.split(/<div class="vm-stats-game\s*" data-game-id="/).slice(1).filter((c) => !c.startsWith('all'));
    const games = [];
    for (const chunk of chunks) {
      const gameId = chunk.match(/^(\d+)/)?.[1];
      const header = chunk.slice(0, chunk.indexOf('vlr-rounds') > 0 ? chunk.indexOf('vlr-rounds') : 4000);
      const mapName = text(header.match(/<div class="map">[\s\S]*?<span style="position: relative; display: inline-block;">\s*([^<]+)/)?.[1] ?? '');
      if (!mapName || /^TBD$/i.test(mapName)) continue;
      const map = mapSlugOf.get(mapName.toLowerCase());
      if (!map) unknown.add(`map:${mapName}`);
      const scores = [...header.matchAll(/<div class="score[^"]*"[^>]*>\s*(\d+)/g)].map((m) => Number(m[1]));
      const pick = header.match(/class="picked mod-(\d)/)?.[1];
      const duration = text(header.match(/map-duration[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '');
      const players = parsePlayers(chunk);
      games.push({
        gameId,
        n: games.length + 1,
        map: map ?? mapName.toLowerCase(),
        score: scores.slice(0, 2),
        pick: pick ? Number(pick) - 1 : null,
        duration,
        players: [players.slice(0, 5), players.slice(5, 10)],
      });
    }
    // マップに VOD を割り当てる: 番号（Map 1 など）が合うもの → マップ名が合うもの
    for (const g of games) {
      const yt = vods.filter((v) => v.site === 'youtube');
      const vod =
        yt.find((v) => v.num === g.n && (!v.name || v.name.toLowerCase() === g.map || mapSlugOf.get(v.name.toLowerCase()) === g.map)) ??
        yt.find((v) => mapSlugOf.get(v.name.toLowerCase()) === g.map) ??
        yt.find((v) => v.num === g.n);
      g.vod = vod ? { id: vod.id, start: vod.start } : null;
    }
    const full = vods.find((v) => v.site === 'youtube' && v.num === null);
    return {
      id: path.split('/')[1],
      path,
      event,
      series,
      date: utc ? `${utc.replace(' ', 'T')}Z` : '',
      patch: patch.replace('Patch ', ''),
      bestOf,
      teams: teams.map((t, i) => ({ ...t, score: score[i] ?? null })),
      games,
      fullVod: full ? { id: full.id, start: full.start } : null,
      otherVods: vods.filter((v) => v.site !== 'youtube').length,
    };
  }

  return { parseMatch, parseVods, unknown };
}
