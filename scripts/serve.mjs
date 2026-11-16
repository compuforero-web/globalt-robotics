// Servidor local de desarrollo (sin dependencias). Imita las reglas de Netlify:
//   node scripts/serve.mjs  →  http://localhost:8080  y  http://localhost:8080/admin
import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary',
  '.mjs': 'text/javascript; charset=utf-8',
};
// Compilador Arduino opcional (services/compilador-arduino): COMPILADOR_SOCKET=ruta.sock o COMPILADOR_URL=http://127.0.0.1:8090
const COMPILER_SOCKET = process.env.COMPILADOR_SOCKET;
const COMPILER_URL = process.env.COMPILADOR_URL && new URL(process.env.COMPILADOR_URL);

function proxyCompiler(req, res) {
  if (!COMPILER_SOCKET && !COMPILER_URL) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"ok":false,"error":"Servicio de compilación pendiente"}');
    return;
  }
  const target = COMPILER_SOCKET ? { socketPath: COMPILER_SOCKET } : { host: COMPILER_URL.hostname, port: COMPILER_URL.port };
  const upstream = request({ ...target, path: req.url, method: req.method,
    headers: { 'content-type': req.headers['content-type'] || '', 'content-length': req.headers['content-length'] || 0 } },
  (answer) => { res.writeHead(answer.statusCode, answer.headers); answer.pipe(res); });
  upstream.setTimeout(30000, () => upstream.destroy());
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"Compilador no disponible"}'); });
  req.pipe(upstream);
}

createServer(async (req, res) => {
  if (req.url.startsWith('/api/arduino/')) { proxyCompiler(req, res); return; }
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
