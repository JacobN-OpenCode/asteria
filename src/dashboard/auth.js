import crypto from 'node:crypto';

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_LENGTH = 6;

export function createDashboardAuth({ client, store, logger = console, slackClientId = '', slackClientSecret = '' }) {
  const oauthConfigured = Boolean(slackClientId && slackClientSecret);
  const codes = new Map();

  function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  function publicUrl(req) {
    const configured = process.env.PUBLIC_URL || process.env.ASTERIA_PUBLIC_URL || '';
    if (configured) {
      return configured.replace(/\/+$/, '');
    }
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim();
    const proto = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
      .split(',')[0]
      .trim();
    return `${proto}://${host}`;
  }

  /**
   * Slack "Sign in with Slack" (OIDC user token). Needs the app's client id and
   * secret plus the redirect url registered on the app.
   */
  function slackAuthorizeUrl(req, state) {
    const redirectUri = `${publicUrl(req)}/auth/slack/callback`;
    const params = new URLSearchParams({
      client_id: slackClientId,
      scope: 'openid profile',
      redirect_uri: redirectUri,
      state,
    });
    return `https://slack.com/openid/connect/authorize?${params}`;
  }

  async function exchangeSlackCode(req, code) {
    const redirectUri = `${publicUrl(req)}/auth/slack/callback`;
    const response = await fetch('https://slack.com/api/openid.connect.token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: slackClientId,
        client_secret: slackClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!body.access_token) {
      throw new Error(body.error || 'openid.connect.token failed');
    }
    const userResponse = await fetch('https://slack.com/api/user.info', {
      headers: { authorization: `Bearer ${body.access_token}` },
    });
    const user = await userResponse.json();
    if (!user.ok || !user.user?.id) {
      throw new Error(user.error || 'user.info failed');
    }
    return user.user;
  }

  /**
   * Fallback that needs no new app configuration: the visitor gives their Slack
   * member id, the bot DMs them a one-time code, and only whoever can read that DM
   * can finish signing in. Proves control of the account without any OAuth app edit.
   */
  async function startDmVerification(slackUserId) {
    if (!/^[UW][A-Z0-9]{7,}$/.test(String(slackUserId || ''))) {
      throw new Error('That does not look like a Slack member ID (it starts with U or W).');
    }
    const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
    codes.set(slackUserId, { code, createdAt: Date.now() });
    const opener = await client.conversations.open({ user: slackUserId });
    await client.chat.postMessage({
      channel: opener.channel.id,
      text: `Your Asteria dashboard sign-in code is *${code}*. It expires in 10 minutes. If this wasn't you, ignore this message.`,
    });
    return { slackUserId, channelId: opener.channel.id };
  }

  function verifyDmCode(slackUserId, code) {
    const pending = codes.get(slackUserId);
    if (!pending) {
      return { ok: false, error: 'Request a new code first.' };
    }
    if (Date.now() - pending.createdAt > CODE_TTL_MS) {
      codes.delete(slackUserId);
      return { ok: false, error: 'That code expired. Request a new one.' };
    }
    if (pending.code !== String(code || '').trim()) {
      return { ok: false, error: 'That code is not right.' };
    }
    codes.delete(slackUserId);
    return { ok: true };
  }

  /** Creates the session row and returns the cookie value to hand back. */
  function completeLogin({ slackUserId, displayName, permissions }) {
    const token = randomToken();
    store.createDashboardSession({ token, slackUserId, role: permissions.role });
    store.upsertDashboardUser({ slackUserId, displayName });
    return token;
  }

  function sessionFromToken(token) {
    const session = store.getDashboardSession(token);
    if (!session) {
      return null;
    }
    store.touchDashboardSession(token);
    return session;
  }

  return {
    oauthConfigured,
    publicUrl,
    slackAuthorizeUrl,
    exchangeSlackCode,
    startDmVerification,
    verifyDmCode,
    completeLogin,
    sessionFromToken,
    randomState: () => randomToken(16),
    randomToken,
    pendingCodeCount: () => codes.size,
    logger,
  };
}
