// データを読み込んでから app.js を動かす入口。
// app.js でトップレベル await を使うと Safari 15 / Chrome 89 未満で丸ごと動かないので、読み込みをここに分けている
Promise.all([
  fetch('/data/meta.json').then((r) => r.json()),
  fetch('/data/videos.json').then((r) => r.json()),
  // X ポストはまだ無い場合もあるので失敗しても空で続ける
  fetch('/data/posts.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []),
]).then(([meta, videos, posts]) => {
  window.__LINEUP_DATA__ = { meta, videos, posts };
  return import('./app.js');
});
