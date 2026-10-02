// 公式とみなす YouTube チャンネル（oEmbed の author_url の末尾）。
// vlr.gg の VOD には公式以外（共同配信など）が登録されることもあるので、ここにあるチャンネルの動画だけを載せる
export const OFFICIAL_CHANNELS = {
  '@ValorantEsports': { name: 'VALORANT Champions Tour', region: 'international' },
  '@valorant_americas': { name: 'VCT Americas', region: 'americas' },
  '@vctemea': { name: 'VCT EMEA', region: 'emea' },
  '@VCTPacific': { name: 'VCT Pacific', region: 'pacific' },
  '@VALORANTEsportsCN': { name: 'VCT CN', region: 'china' },
  '@valorantjp': { name: 'VALORANT // JAPAN', region: 'pacific' },
};

export const handleOf = (channelUrl = '') => channelUrl.replace(/^https:\/\/www\.youtube\.com\//, '');
