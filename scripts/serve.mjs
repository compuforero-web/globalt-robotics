// Servidor local de desarrollo (sin dependencias). Imita las reglas de Netlify:
//   node scripts/serve.mjs  →  http://localhost:8080  y  http://localhost:8080/admin
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (/^\/admin\/?(.*)?$/.test(path)) path = '/admin.html';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Prohibido'); return; }
  try {
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 · No encontrado');
  }
}).listen(PORT, () => console.log(`GLOBALT ROBOTICS en http://localhost:${PORT}  ·  Admin: http://localhost:${PORT}/admin`));
