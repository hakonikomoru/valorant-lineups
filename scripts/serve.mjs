// 依存なしの開発用静的サーバー。使い方: npm run dev（PORT で変更可）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // /sova/ascent のようなページの URL は index.html を返す（本番は Vercel の rewrites で同じ動き）
    if (!extname(path)) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      return res.end(await readFile(join(root, 'index.html')));
    }
    res.writeHead(404).end('Not Found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
