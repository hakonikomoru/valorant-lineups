// 1 試合のマップの並びと、動画の中の開始秒を整える（scripts/vct/merge-matches.mjs で使う。テストは test/vct/timeline.test.mjs）
//
// vlr.gg の VOD の開始秒は、公式動画のフレームを見て確かめた限り正しいが、マップの番号（何マップ目か）が
// 実際の試合順と違うことがある（2026 年の 13 試合。docs/RESEARCH.md）。そこで:
// - overrides（{ マップ番号: { start } }）で開始秒を直す
// - 同じ動画で開始秒が重複しているマップは、どれが正しいか分からないので推定（vod.estimated）にし、
//   後のマップは前のマップの開始秒 + 試合時間 + 5 分（マップ間の休憩）の位置にずらす
// - その試合の全マップが 1 本の動画に入っていれば、開始秒の順に MAP 番号を振り直す
const BREAK_SEC = 300;
const DEFAULT_MAP_SEC = 45 * 60;

// '38:55'・'1:04:51' → 秒。読めなければ null（vlr.gg では '-' のことがある）
export function durationSec(text) {
  if (!/^\d+(:\d{2}){1,2}$/.test(text ?? '')) return null;
  return text.split(':').reduce((sec, part) => sec * 60 + Number(part), 0);
}

export function normalizeTimeline(games, overrides = {}) {
  const out = games.map((g) => ({ ...g, vod: { ...g.vod } }));
  for (const g of out) {
    const fix = overrides[g.n];
    if (fix?.start !== undefined) g.vod.start = fix.start;
  }
  // 同じ動画・同じ開始秒のマップ
  const seen = new Map();
  for (const g of out) {
    const key = `${g.vod.id}@${g.vod.start}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, g);
      continue;
    }
    first.vod.estimated = true;
    g.vod.estimated = true;
  }
  // 3 マップ以上重複していても順にずらせるよう、ずらす前の開始秒で比べる
  const original = out.map((g) => g.vod.start);
  for (const [i, g] of out.entries()) {
    const prev = out[i - 1];
    if (!g.vod.estimated || !prev || prev.vod.id !== g.vod.id || original[i] !== original[i - 1]) continue;
    g.vod.start = prev.vod.start + (durationSec(prev.duration) ?? DEFAULT_MAP_SEC) + BREAK_SEC;
  }
  const oneVideo = out.every((g) => g.vod.id === out[0].vod.id);
  if (!oneVideo) return out;
  return out.sort((a, b) => a.vod.start - b.vod.start).map((g, i) => ({ ...g, n: i + 1 }));
}
