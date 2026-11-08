import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/workspace.css': ['workspace.css', 'text/css; charset=utf-8'],
};
const root = new URL('../examples/workbench/', import.meta.url);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PREVIEW_PORT || 18228);
const backendPort = Number(process.env.PORT || 18227);
const sockets = new WebSocketServer({ noServer: true });
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/') || ['/sdk/latentx-voice.js', '/sdk/JsSIP-LICENSE.txt'].includes(pathname)) {
    const upstream = httpRequest({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${backendPort}`, origin: `http://127.0.0.1:${backendPort}` } }, response => {
      res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local service unavailable'); });
    req.pipe(upstream); return;
  }
  if (['GET','HEAD'].includes(req.method) && (pathname === '/im-h5.html' || /^\/assets\/[\w.-]+\.(js|css)$/.test(pathname))) {
    try {
      const data = await readFile(path.join(dist, pathname.slice(1)));
      const type = pathname.endsWith('.html') ? 'text/html; charset=utf-8' : pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
      res.writeHead(200, {'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      return res.end(req.method==='HEAD'?undefined:data);
    } catch { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});return res.end('H5 尚未构建，请先执行 npm run build'); }
  }
  const file = files[pathname];
  if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end('Not found'); }
  try {
    const data = await readFile(new URL(file[0], root));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Preview file unavailable'); }
});
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/api/im') { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  sockets.handleUpgrade(req, socket, head, client => {
    const upstream = new WebSocket(`ws://127.0.0.1:${backendPort}${req.url}`, {
      headers: { origin: `http://127.0.0.1:${backendPort}` },
      perMessageDeflate: false,
    });
    const queue = [];
    client.on('message', (data, isBinary) => {
      const frame = isBinary ? data : data.toString();
      if (upstream.readyState === WebSocket.OPEN) upstream.send(frame, { binary: isBinary });
      else queue.push({ frame, isBinary });
    });
    upstream.on('open', () => {
      for (const { frame, isBinary } of queue.splice(0))
        upstream.send(frame, { binary: isBinary });
    });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN)
        client.send(isBinary ? data : data.toString(), { binary: isBinary });
    });
    const close = () => { try { upstream.close(); } catch {} try { client.close(); } catch {} };
    client.on('close', close); upstream.on('close', close); client.on('error', close); upstream.on('error', close);
  });
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : e.message); process.exitCode=1; });
server.listen(port, '127.0.0.1', () => console.log(`Studio Partner preview: http://127.0.0.1:${port}/#robots`));
