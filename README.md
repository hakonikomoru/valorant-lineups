# VALORANT スキル定点アーカイブ

VALORANT のスキル定点（ラインナップ）を紹介する YouTube 動画を、**エージェント別 → マップ別**のタブで探せる静的サイトです。

- 21 エージェント × 13 マップ、計 1,000 本以上の動画を収録（すべて YouTube oEmbed で実在を確認済み）
- エージェントタブはロール別（イニシエーター／コントローラー／センチネル／デュエリスト）に並びます
- マップタブは現在のコンペのマッププール（`POOL`）が先頭、プール外のマップがその後に並びます
- 「ストリーマー・プロ」タブで、人気ストリーマー（Xandrite・ゆの・一ノ瀬とおる・GON など）とプロ（ZETA Laz・TL nAts など、VCT で使われたものを含む）の定点・セットアップを、人の名前で絞り込んで見られます（`/pro?who=Laz` のように共有可）。誰の動画かは sources の `creator`、投稿チャンネル（`data/channels.json` の `creator`）、`pro`（「ZETA Laz / 大会名」の選手名）の順に決めます
- 「モロトフ定点」「YouTubeショート」の特集タブで、エージェントを横断して空爆系の定点や YouTube ショートをまとめて見られます（エージェント・マップでさらに絞り込み可）
- 「攻め／守り／設置後／リテイク／ワンウェイ／セットアップ／モロトフ」のタグ、言語、キーワードで絞り込めます
- 「X ポスト」タブで X（旧 Twitter）の定点ポスト（動画付きのものだけ）も見られます。エージェント別の表示でも動画の下に同じエージェント・マップのポストが並びます
- 動画はサイト内のモーダルで再生します（youtube.com の埋め込み。youtube-nocookie だとログイン中でも bot 確認が出やすいため）。
  - YouTube の「bot ではないことを確認」が出るブラウザ（YouTube 未ログイン、Safari・Firefox・Brave などの Cookie 制限）向けに、YouTube の IFrame Player API で再生が始まったかを見て、エラーか 6 秒たっても始まらなければ「YouTube で開く」の案内を出します
  - 一覧の上の「サイト内で再生 / YouTube で開く」で、最初から YouTube（スマホはアプリ）で開くようにもできます（ブラウザの localStorage に記憶）X のポストは公式の埋め込み（widgets.js）で表示します
- URL は `/sova/ascent`（特集は `/molly/ascent/viper`、`/shorts`）のように表示状態を持つので、そのまま共有できます（以前の `#/sova/ascent` 形式のリンクも自動で新しい URL に移ります）
- SEO: エージェント × マップ・特集 × マップごとのページ（約 340 ページ）を書き出し、それぞれにタイトル・説明文・canonical・OGP・パンくず（構造化データ）と動画一覧のリンクを入れています。`sitemap.xml`・`robots.txt` も生成します
- スマホ表示に対応。エージェント・マップの一覧はスワイプ、PC ではホイールや左右の矢印ボタンで横に送れます

## 対応ブラウザ

2020 年ごろ以降のブラウザで動くようにしています（iOS / iPadOS 14 以降の Safari、Android の Chrome 85 以降、Samsung Internet 14 以降、PC の Chrome・Edge・Firefox・Safari）。

- JavaScript は ES2021 までの書き方にしています（トップレベル await・`Map.groupBy` などは使わない）。確認: `npx es-check es2021 assets/js/*.js --module`
- `<dialog>` が無いブラウザ（Safari 15.4 未満など）は `app.js` の `shimDialog` で代わりに動かします
- `aspect-ratio` が無いブラウザ（Safari 15 未満など）は `style.css` の `@supports not (aspect-ratio: 1 / 1)` で縦横比を作ります
- それより古いブラウザでは、ページに書き出してある動画タイトルのリンク一覧が表示されます

## 使い方

```sh
npm run dev      # http://localhost:5173 で起動（依存パッケージなし）
npm run build:site   # 公開用のページを _site/ に書き出す（Vercel と同じもの）
```

`fetch` で JSON を読むため、`index.html` を直接ファイルとして開くのではなく HTTP サーバー経由で表示してください。GitHub Pages などの静的ホスティングにそのまま置けます。

## 公開と自動更新

https://lineup-archive.vercel.app で公開しています。

- **公開**: Vercel（komolab チームの `lineup-archive` プロジェクト）が GitHub の `main` への push を検知して自動でデプロイします。ビルドは [scripts/build-site.mjs](scripts/build-site.mjs) で、ページごとの HTML・sitemap.xml・robots.txt を `_site/` に書き出します（公開するのは index.html・assets・生成済みの JSON とそれらのページだけ）
- **自動更新**: GitHub Actions（[.github/workflows/site.yml](.github/workflows/site.yml)）が毎日 4:00（日本時間）に次を実行し、変更があればコミットします（その push で Vercel が公開）

1. `npm run meta` … 新エージェント・新マップの反映（マッププールは `COMPETITIVE_POOL` を手で更新）
2. `npm run discover` … 登録チャンネル（`data/channels.json`）の RSS から新着の定点動画を探し `data/sources/auto.json` に追記
3. `npm run shorts` / `npm run verify -- --prune` / `npm run x-media -- --prune` … ショート判定・リンク切れ削除・X の動画情報更新
4. `npm run merge` → 変更があればコミットして公開

Actions タブの「Run workflow」で手動でも実行できます。リンク切れが全体の 3% を超えたときは通信側の問題とみなし、削除せずに止まります。

### 補足

- API キーなどの設定は不要です（新着は YouTube がチャンネルごとに公開している RSS から取得します）
- X のポストは自動では追加しません（X の検索 API は有料のため）。手動で `data/sources/x/` に追加してください

## データの更新

| コマンド | 内容 |
|---|---|
| `npm run meta` | [valorant-api.com](https://valorant-api.com) からエージェント・マップ・アビリティ（日本語名・画像 URL）を取得し `data/meta.json` を生成 |
| `npm run merge` | `data/sources/*.json` を統合・重複除去し、タイトルからタグを推定して `data/videos.json` を生成 |
| `npm run shorts` | 全動画を oEmbed で調べ、ショート動画（縦長）の sources に `"short": true` を付ける（その後 `npm run merge`） |
| `npm run x-media` | X ポストのメディアの種類・動画のサムネイルを調べて sources に記録（`-- --prune` で動画の無いポストを削除） |
| `npm run discover` | 登録チャンネルの RSS（各チャンネルの最新 15 本、API キー不要）から新着の定点動画を探し `data/sources/auto.json` に追記。タイトルに定点系の語・エージェント名・マップ名がそろい、埋め込み可能なものだけ採用 |
| `npm run channels -- <@ハンドル \| 動画URL>` | 新着を見に行くチャンネルを `data/channels.json` に登録（`-- --from-archive 3` で収録 3 本以上のチャンネルをまとめて登録） |
| `npm run verify` | 全動画を YouTube oEmbed、全ポストを X oEmbed で確認し、削除・非公開のものを報告（`-- --prune` で sources から削除） |

### 新着を見に行くチャンネルを増やす

```sh
npm run channels -- @valo-xyz                      # ハンドルで
npm run channels -- https://youtu.be/XXXXXXXXXXX   # そのチャンネルの動画の URL で
```

特定のエージェント専門のチャンネル（例: サイファー専門の一ノ瀬とおる）は、`data/channels.json` のそのチャンネルに `"agent": "cypher"` のように書くと、タイトルにエージェント名が無い動画もそのエージェントとして拾います。

登録したチャンネルは翌日 4:00 の自動更新から対象になります（`data/channels.json` を push してください）。登録していないチャンネルの動画は自動では見つからないので、良い定点チャンネルを見つけたら登録してください。

### 動画を追加する

新着チェックでは拾えない過去の動画を手で選んで入れるときは `data/sources/manual.json` に追記します（`"tags": ["setup"]` のようにタグを直接付けることもできます）。


`data/sources/` の任意の JSON（または新しいファイル）に追記して `npm run merge` を実行します。

```json
{ "agent": "sova", "map": "ascent", "youtubeId": "XXXXXXXXXXX", "title": "動画タイトル", "channel": "チャンネル名", "lang": "ja" }
```

- `agent` / `map` は `data/meta.json` の `slug`（例: `kayo`, `summit`）。複数マップをまとめた動画は `map: "all"`
- ショート動画は `"short": true` を付ける（`npm run shorts` で自動判定もできます）。モロトフのタグはタイトルから自動で付きます
- 同じ動画を複数のエージェントに登録すると、1 件にまとめられ各エージェントのタブに表示されます

### X のポストを追加する

`data/sources/x/` の JSON に追記し、`npm run x-media -- --prune` → `npm run merge` の順に実行すると `data/posts.json` が生成されます。サイトに載せるのは**動画付きのポストだけ**です。`x-media` が各ポストの `media`（video / photo / card / none）と、動画のサムネイル（`thumb`）・長さ（`duration`）・縦長か（`vertical`）を調べて記録し、`--prune` で動画の無いポストを取り除きます（merge も `media: "video"` 以外は無視します）。ポスト ID は `https://publish.x.com/oembed?url=https://x.com/<handle>/status/<id>` が 200 を返すことを確認してください（404 は削除済み）。

```json
{ "agent": "sova", "map": "ascent", "postId": "1234567890123456789", "handle": "someone", "author": "表示名", "text": "本文", "date": "2026-05-01", "lang": "ja", "media": "video" }
```

### マッププールが変わったら

`scripts/build-meta.mjs` の `COMPETITIVE_POOL` を書き換えて `npm run meta` を実行します。新エージェント・新マップも `npm run meta` で自動的に反映されます。

## 構成

```
index.html              ページ本体
assets/css/style.css    スタイル（VALORANT ブランドカラー #FF4655 / #0F1923 / #ECE8E1）
assets/js/app.js        タブ・絞り込み・プレイヤー
data/meta.json          エージェント・マップ情報（生成物）
data/videos.json        動画一覧（生成物）
data/posts.json         X ポスト一覧（生成物）
data/sources/*.json     動画の元データ（ここを編集する）
data/sources/x/*.json   X ポストの元データ
static/                 サイトのルートにそのまま置くファイル（Google Search Console の確認ファイルなど）
scripts/                データ生成・検証・開発サーバー
docs/RESEARCH.md        スキル定点に関する調査メモ
```

## 制作

komolab

## 注意

動画の権利は各投稿者に帰属します。本サイトは Riot Games の承認を受けたものではありません（[Legal Jibber Jabber](https://www.riotgames.com/en/legal) に準拠したファンコンテンツ）。
