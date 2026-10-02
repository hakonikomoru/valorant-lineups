// VCT のページの URL・タイトル・説明文。ブラウザ（vct/app.js）とページ生成（scripts/vct/build-pages.mjs）の両方で使う
// サイト（https://lineup-archive.vercel.app）の /vct 以下に置く。定点のページ（assets/js/seo.js）とはドメインを共有する
export const SITE = {
  url: 'https://lineup-archive.vercel.app',
  base: '/vct',
  name: 'VCT MAP ARCHIVE',
  nameJa: 'VALORANT プロ試合 マップ別アーカイブ',
  author: 'komolab',
};

export const ALL = 'all';

// { map, event } → '/vct'・'/vct/ascent'・'/vct/ascent/champions-2026'・'/vct/all/champions-2026'
export function routePath({ map, event }) {
  if (event === ALL) return map === ALL ? SITE.base : `${SITE.base}/${map}`;
  return `${SITE.base}/${map}/${event}`;
}

// '/vct/ascent/champions-2026' → { map, event } の生の値（妥当かどうかは呼ぶ側で確かめる）
export function parsePath(path) {
  const rest = decodeURI(path).replace(/^\/+|\/+$/g, '').replace(/^vct(\/|$)/, '');
  const [map = ALL, event = ALL] = rest.split('/');
  return { map: map || ALL, event: event || ALL };
}
// ページの <title> と meta description。count はそのページに並ぶマップ（試合のうちの 1 マップ）の数
export function seoFor({ map, event }, data, meta, count) {
  const m = meta.maps.find((x) => x.slug === map);
  const e = data.events.find((x) => x.slug === event);
  const n = `${count}マップ`;
  if (!m && !e) {
    return {
      title: `VALORANT プロの試合をマップ別に見る｜VCT 公式 VOD アーカイブ | ${SITE.name}`,
      description: `VALORANT のプロの試合（VCT）を、公式 YouTube の VOD でマップごとに見られるサイト。${meta.maps
        .filter((x) => x.inPool)
        .map((x) => x.name)
        .join('・')}などマップを選ぶと、そのマップの試合だけが並び、1 本の配信に複数マップが入っている動画もそのマップの開始位置から再生できます。大会・地域・チーム・エージェント構成で絞り込めます。`,
    };
  }
  const where = m ? `${m.name}（${m.nameEn}）` : '全マップ';
  const which = e ? e.name : 'VCT';
  return {
    title: `${which} ${m ? m.name : ''}の試合 ${n}｜VALORANT プロの試合をマップ別に | ${SITE.name}`.replace(' の', 'の'),
    description: `VALORANT ${which}の${where}の試合 ${n}を、公式 YouTube の VOD でマップの開始位置から再生できます。チームごとのエージェント構成・スコア・ピックしたチームも一覧で確認でき、地域・チーム・エージェントで絞り込めます。`,
  };
}
