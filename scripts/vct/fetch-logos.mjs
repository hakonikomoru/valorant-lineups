// data/vct/sources/vlr/*.json のチームロゴを assets/vct/teams/ に保存する。
// 使い方: node scripts/vct/fetch-logos.mjs
//
// - vlr.gg の画像サーバー（owcdn.net）は他サイトからの直リンクを 403 で断るので、サイトに置いた画像を表示する
// - ファイル名は owcdn.net のもの（ロゴが変わると名前も変わる）。保存済みのものは取りに行かない
// - matches.json の logo を /assets/vct/teams/<ファイル名> にするのは merge-matches.mjs（保存できていないロゴは空にする）
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { logoFile } from './lib/logos.mjs';

const root = new URL('../../', import.meta.url);
const srcDir = new URL('data/vct/sources/vlr/', root);
const outDir = new URL('assets/vct/teams/', root);
await mkdir(outDir, { recursive: true });

const urls = new Set();
for (const f of (await readdir(srcDir)).filter((f) => f.endsWith('.json'))) {
  for (const m of JSON.parse(await readFile(new URL(f, srcDir), 'utf8'))) for (const t of m.teams) if (logoFile(t.logo)) urls.add(t.logo);
}

let saved = 0;
const failed = [];
for (const url of urls) {
  const file = new URL(logoFile(url), outDir);
  if (await access(file).then(() => true, () => false)) continue;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) {
    failed.push(`${res?.status ?? 'ERR'} ${url}`);
    continue;
  }
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  saved++;
}
console.log(`チームロゴ: ${urls.size} 件中 ${saved} 件を新しく保存${failed.length ? `、取得できなかったもの ${failed.length} 件:\n${failed.join('\n')}` : ''}`);
