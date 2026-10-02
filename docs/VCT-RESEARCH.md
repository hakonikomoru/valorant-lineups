# プロの試合の公式動画 調査メモ（2026-10-02 時点）

サイト設計の前に行った、VCT（VALORANT Champions Tour）の公式 YouTube 動画の調査のまとめ。

## 公式チャンネルと動画の単位

VCT の試合の VOD は、地域ごとの公式チャンネルが YouTube に上げている。**1 本の動画に入っているマップの数がチャンネルによってまったく違う**のが、このサイトの設計で一番大きな前提。

| チャンネル | ハンドル | 対象 | 1 本の動画の単位 | タイトルの例 |
|---|---|---|---|---|
| VALORANT Champions Tour | `@ValorantEsports` | Masters・Champions | **1 試合 1 本**（FULL MATCH、2〜3 マップ） | `TL vs. PRX — FULL MATCH — VALORANT Champions Shanghai — Opening Day` |
| VALORANT Champions Tour Americas | `@valorant_americas` | Americas | 基本は 1 マップ 1 本。一部は 1 試合 1 本 | `ENVY vs. EG - VCT Americas Kickoff - W1D1 - Map 01` |
| VALORANT Champions Tour EMEA | `@vctemea` | EMEA | 1 マップ 1 本（決勝などは配信まるごと） | `NAVI vs. KC - VCT EMEA 2026 Kickoff - Playoffs - Map 1` |
| VALORANT Champions Tour Pacific | `@VCTPacific` | Pacific | **1 日の配信まるごと 1 本**（2 試合・4〜7 マップ、5〜6 時間） | `NS vs TS / ZETA vs FS - VCT Pacific - Kickoff - Upper Bracket R1 - Day 1` |
| VALORANT Champions Tour CN | `@VALORANTEsportsCN` | China | **1 日の配信まるごと 1 本** | （中国語） |

- どの FULL MATCH・配信の VOD にも **YouTube のチャプターは無い**（`yt-dlp -j` の `chapters` が空）。説明欄にもタイムスタンプは無い
- 1 マップ 1 本の動画でも、冒頭に数十秒〜5 分ほどの待ち時間がある（Americas の例: 315 秒目からマップ開始）
- そのため「マップの開始位置から再生する」には、**動画 ID + 開始秒**の組が必要
- ほかに `MATCH HIGHLIGHTS`（1 試合 25〜40 分）もあるが、マップ単位ではないので載せていない
- 日本語の公式（`@valorantjp`）はドキュメンタリーや紹介動画が中心で、試合の VOD は無い

## マップごとの開始秒の出どころ: VLR.gg

[VLR.gg](https://www.vlr.gg) の試合ページの「VODs」には、マップごとに YouTube の VOD と開始秒が登録されている（`data-site-id="lfZ3nXSWT5g" data-embed-start="2387"` と `<span class="sm-vod-num">2</span><span class="sm-vod-name">Haven</span>`）。同じページにマップごとのスコア・ピック・試合時間・各選手のエージェントもある。robots.txt で試合ページの取得は禁止されていない（`/search/auto` と `/rr/` のみ禁止）。

2026 年の VCT 全 15 大会（Kickoff・Stage 1・Stage 2 の 4 地域と Masters Santiago / London、Champions Shanghai）で調べた結果:

| | 数 |
|---|---|
| 終了済みの試合 | 601 |
| 行われたマップ | 1,533 |
| YouTube の VOD と開始秒があるマップ | 1,527（99.6%） |
| そのうち公式チャンネルの VOD | 1,527（すべて） |
| 再生できない（非公開・埋め込み不可） | 0 |

### 開始秒が正しいかの確認

公式動画からその時刻のフレームを切り出して（`yt-dlp -g` で得た URL を `ffmpeg -ss` で読む）、実際に何が映っているかを見た。

- Pacific の 1 日配信（`NxlC6Eyn-_I`）: 4274 秒は「MAP 1 HAVEN 0-0」のマップ紹介、その 60 秒後は第 1 ラウンド。7083 秒の Split も同じ。開始秒は**マップ紹介の頭**を指している
- 同じ動画の中で開始秒がマップ番号の順に並んでいない 13 試合を調べた: 11 試合はフレームを見て、**開始秒は正しく、VLR.gg のマップ番号（何マップ目か）の方が実際の順番と違う**ことを確かめた（例: VIT vs TH は Breeze → Lotus → Pearl → Split → Haven の順だったが、VLR.gg では Pearl が 5 マップ目）。NS vs G2（Masters Santiago）は Abyss が 5 秒目からで、各マップの試合時間を足すと動画の長さ（8474 秒）とぴったり合うので、これも順番違い
- 残る 1 試合（NOVA vs FPX、China Stage 2）は 2 マップに同じ開始秒が登録されており、どちらかが誤り

→ `scripts/vct/lib/timeline.mjs` で、1 本の動画に全マップが入っている試合は開始秒の順に MAP 番号を振り直す。開始秒が重複しているマップは「推定」にして、前のマップの開始秒 + 試合時間 + 5 分の位置から再生する（画面に「推定」と表示）。正しい開始秒が分かったら `data/vct/sources/overrides.json` で直す。

- YouTube の動画 URL を短時間に何十回も取りに行くと 403 になる。フレームの確認は少数にとどめること

## 埋め込み再生

- 埋め込みの `start=<秒>` で、マップの開始位置から再生できる。YouTube で開くリンクは `watch?v=<ID>&t=<秒>s`
- 同じ動画の別マップへは、YouTube の IFrame Player API の `seekTo` で読み込み直さずに移れる（1 日配信の VOD で便利）
- 参考サイト（valorant-lineups）と同じく、youtube.com の埋め込みを使い、6 秒たっても再生が始まらなければ「YouTube で開く」を案内する

## 画像・データ

- マップ・エージェントの名前と画像は [valorant-api.com](https://valorant-api.com)（`language=ja-JP` で日本語名）
- チームのロゴは VLR.gg の画像（owcdn.net）をそのまま表示している
- ブランドカラー・フォントは参考サイトと同じ（`#FF4655` / `#0F1923` / `#ECE8E1`、Anton・Barlow・Noto Sans JP）
