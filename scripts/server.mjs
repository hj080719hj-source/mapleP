import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png':'image/png' };
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const path = resolve(root, '.' + pathname);
    if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('페이지를 찾을 수 없습니다.'); }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`Maple You: http://127.0.0.1:${server.address().port}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
