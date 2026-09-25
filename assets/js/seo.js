// ページごとの URL・タイトル・説明文。ブラウザ（app.js）とページ生成（scripts/build-site.mjs）の両方で使う
export const SITE = {
  url: 'https://lineup-archive.vercel.app',
  name: 'LINEUP ARCHIVE',
  nameJa: 'VALORANT スキル定点アーカイブ',
  author: 'komolab',
};

export const ALL = 'all';

export const FEATURE_NAMES = {
  molly: 'モロトフ定点',
  shorts: 'YouTubeショート',
  posts: 'X ポスト',
};

// { view, agent, map } → '/sova/ascent'・'/molly/ascent/viper' など
export function routePath({ view, agent, map }) {
  const parts =
    view === 'agent'
      ? [agent, map === ALL ? '' : map]
      : [view, map === ALL && agent === ALL ? '' : map, agent === ALL ? '' : agent];
  return `/${parts.filter(Boolean).join('/')}`;
}

// '/sova/ascent' → { first, map, agent } の生の値（妥当かどうかは呼ぶ側で確かめる）
export function parsePath(path) {
  const [first = '', map = '', agent = ''] = decodeURI(path).replace(/^\/+|\/+$/g, '').split('/');
  return { first, map, agent };
}

const unit = (view) => (view === 'posts' ? '件' : '本');

// ページの <title> と meta description。count はそのページに並ぶ動画（ポスト）の数
export function seoFor({ view, agent, map, home = false }, meta, count) {
  const a = meta.agents.find((x) => x.slug === agent);
  const m = meta.maps.find((x) => x.slug === map);
  const mapJa = m ? m.name : map === 'multi' ? '複数マップ' : '';
  const n = `${count}${unit(view)}`;

  if (home) {
    return {
      title: `VALORANT 定点まとめ｜エージェント別・マップ別のスキル定点動画 | ${SITE.name}`,
      description: `VALORANT のスキル定点（ラインナップ）動画をエージェント別・マップ別にまとめたサイト。ソーヴァ・ヴァイパー・ブリムストーン・キルジョイなど全エージェント、全マップの定点を、攻め・守り・設置後・リテイク・ワンウェイの用途別に探してその場で再生できます。モロトフ定点・YouTubeショート・X の定点ポストも毎日自動で更新。`,
    };
  }

  if (view === 'agent') {
    const abilities = a.abilities.map((ab) => ab.name).join('・');
    const where = m || map === 'multi' ? `${mapJa}の` : '';
    return {
      title: `${a.name}（${a.nameEn}）${where}定点まとめ ${n} | VALORANT ${SITE.name}`,
      description: `VALORANT ${a.name}（${a.nameEn}）の${m ? `${mapJa}（${m.nameEn}）で使える` : '全マップの'}スキル定点（ラインナップ）動画${n}をまとめました。${abilities}の定点を、攻め・守り・設置後・リテイク・ワンウェイなど用途別に探して、その場で再生できます。`,
    };
  }

  const feature = FEATURE_NAMES[view];
  const who = a ? `${a.name}の` : '';
  const where = m ? `${mapJa}の` : '';
  const about = {
    molly: 'ブリムストーンのインセンディアリー、ヴァイパーのスネークバイト、キルジョイのナノスワーム、KAY/O のフラグ/メントなど、設置後の解除阻止や遅延に使う空爆系のモロトフ定点',
    shorts: '数十秒で立ち位置と照準を確認できる YouTube ショートの定点動画',
    posts: 'X（旧 Twitter）に投稿された、動画付きの定点ポスト',
  }[view];
  return {
    title: `${where}${who}${feature}まとめ ${n} | VALORANT ${SITE.name}`,
    description: `VALORANT の${where}${who}${about}を${n}まとめました。エージェント・マップ別に絞り込んで、その場で再生できます。毎日自動で更新しています。`,
  };
}
