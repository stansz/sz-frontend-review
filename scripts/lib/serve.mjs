import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isReachable(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(2000, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

export async function serveDir(root) {
  const rootAbs = path.resolve(root);

  const server = http.createServer((req, res) => {
    try {
      let urlPath = (req.url || '/').split('?')[0];
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch {
        res.writeHead(400).end('Bad Request');
        return;
      }
      const normalized = path.normalize(urlPath);
      let filePath = path.join(rootAbs, normalized);
      if (filePath !== rootAbs && !filePath.startsWith(rootAbs + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        res.writeHead(404).end('Not Found');
        return;
      }
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        try {
          stat = fs.statSync(indexPath);
          filePath = indexPath;
        } catch {
          res.writeHead(404).end('Not Found');
          return;
        }
      }
      const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(500).end('Internal Server Error');
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });

  let { port } = server.address();

  // Some sandboxed environments hand out an ephemeral port from bind(0) that
  // never becomes reachable; probe and fall back to binding that specific port.
  if (!(await isReachable(port))) {
    await new Promise((resolve) => server.close(resolve));
    const probe = http.createServer();
    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      probe.once('error', onError);
      probe.listen(0, '127.0.0.1', () => {
        probe.removeListener('error', onError);
        resolve();
      });
    });
    const fixed = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      server.once('error', onError);
      server.listen(fixed, '127.0.0.1', () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
    port = server.address().port;
  }

  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
