import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatusRss, readStatusEvents } from './status-core.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const eventsFilePath = process.env.ASTERIA_STATUS_FILE || path.join(repoRoot, 'data', 'status-events.json');
const port = Number(process.env.ASTERIA_STATUS_PORT || 8787);
const siteUrl = process.env.ASTERIA_STATUS_URL || 'http://localhost';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, siteUrl);

  if (url.pathname === '/rss.xml' || url.pathname === '/rss') {
    res.writeHead(200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(buildStatusRss({ events: readStatusEvents(eventsFilePath), siteUrl }));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/health') {
    const events = readStatusEvents(eventsFilePath);
    const lastEvent = events[events.length - 1] ?? null;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, status: lastEvent?.state ?? 'unknown', lastEvent }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[asteria-status] listening on 0.0.0.0:${port}, events file ${eventsFilePath}`);
});
