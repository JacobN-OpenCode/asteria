/**
 * Optional HTTP server exposing POST /webhooks/todoist for Todoist webhooks.
 * @typedef {import('./types.js').SyncServiceDeps} SyncServiceDeps
 * @typedef {import('./types.js').SyncSettings} SyncSettings
 */
import crypto from 'node:crypto';
import http from 'node:http';

/**
 * Constant-time HMAC comparison for the Todoist signature header.
 * @param {string} rawBody
 * @param {string} secret
 * @param {string} expectedSignature hex/base64 signature from the X-Todoist-Hmac-SHA256 header
 * @returns {boolean}
 */
function verifySignature(rawBody, secret, expectedSignature) {
  if (!expectedSignature || !secret) {
    return false;
  }
  const hmac = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const expected = Buffer.from(expectedSignature, 'base64');
  const actual = Buffer.from(hmac, 'base64');
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

export { verifySignature };

/**
 * @param {SyncServiceDeps & { sync: { handleTodoistEvent: (event: object, settings: SyncSettings) => Promise<void> }, getSettings: () => SyncSettings, port?: number }} deps
 */
export function createWebhookServer({ sync, getSettings, logger, port = 8792 }) {
  let server = null;

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handleRequest(req, res) {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && req.url === '/webhooks/todoist') {
      await handleTodoistWebhook(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handleTodoistWebhook(req, res) {
    const settings = getSettings();
    const secret = settings.webhook_secret;
    if (!secret) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Webhook secret not configured');
      return;
    }

    const rawBody = await readBody(req);
    const expectedSignature = req.headers['x-todoist-hmac-sha256'];
    if (!verifySignature(rawBody, secret, String(expectedSignature ?? ''))) {
      logger?.warn('Todoist webhook signature verification failed');
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Invalid signature');
      return;
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid JSON body');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

    try {
      await sync.handleTodoistEvent(event, settings);
    } catch (error) {
      logger?.error?.('Todoist webhook handler failed', error);
    }
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @returns {Promise<string>}
   */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      req.on('error', reject);
    });
  }

  return {
    start() {
      if (server) {
        return server;
      }
      server = http.createServer(handleRequest);
      server.listen(port, '0.0.0.0', () => {
        logger?.info?.(`Todoist webhook server listening on 0.0.0.0:${port}`);
      });
      return server;
    },

    stop() {
      if (server) {
        server.close();
        server = null;
      }
    },
  };
}
