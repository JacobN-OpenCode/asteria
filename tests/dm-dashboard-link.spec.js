import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { registerDmDashboardLink } from '../src/dm/dashboard-link.js';

const DM = 'D0BOTDM001';

function createHarness() {
  const client = {
    chat: { postMessage: mock.fn(async () => ({ ts: '1.1' })) },
  };
  const app = { message: mock.fn() };
  const logger = { info: mock.fn(), error: mock.fn() };
  const auth = { issueMagicLink: mock.fn(() => 'https://asteria.navaratne.uk/auth/magic?token=abc') };
  const store = { recordTriggerLog: mock.fn() };
  registerDmDashboardLink({
    app,
    client,
    auth,
    store,
    logger,
    baseUrl: 'https://asteria.navaratne.uk',
  });
  const handler = app.message.mock.calls[0].arguments[0];
  return { handler, client, auth, store, logger };
}

const directMessage = (text, user = 'U0AEYDUCLKF') => ({
  message: { channel: DM, channel_type: 'im', user, text, ts: '1.1' },
});

describe('dashboard sign in link over DM', () => {
  it('replies with a link in the same DM', async () => {
    const { handler, client, auth, store } = createHarness();
    await handler(directMessage('dashboard'));

    assert.equal(auth.issueMagicLink.mock.callCount(), 1);
    assert.equal(client.chat.postMessage.mock.callCount(), 1);
    const reply = client.chat.postMessage.mock.calls[0].arguments[0];
    assert.equal(reply.channel, DM, 'goes back to the person who asked, nowhere else');
    assert(reply.text.includes('/auth/magic?token=abc'), 'and carries the link');
    assert(reply.text.includes('10 minutes'), 'and says how long it lasts');
    assert.equal(store.recordTriggerLog.mock.calls[0].arguments[0].action, 'dashboard_link_sent');
  });

  it('accepts the ways people actually ask for it', async () => {
    for (const text of ['dashboard', 'sign in', 'login', 'Dashboard please', 'where is the site']) {
      const { handler, client } = createHarness();
      await handler(directMessage(text));
      assert.equal(client.chat.postMessage.mock.callCount(), 1, `answers "${text}"`);
    }
  });

  it('stays quiet in a channel and for unrelated DMs', async () => {
    for (const payload of [
      { message: { channel: 'Cgeneral', user: 'U0AEYDUCLKF', text: 'dashboard', ts: '1.1' } },
      directMessage('what a great meeting'),
      directMessage('the dashboard looks broken'),
    ]) {
      const { handler, client } = createHarness();
      await handler(payload);
      assert.equal(client.chat.postMessage.mock.callCount(), 0, 'no unprompted DMs');
    }
  });

  it('does not reply to itself', async () => {
    const { handler, client } = createHarness();
    await handler({
      message: { channel: DM, channel_type: 'im', user: 'U0AEYDUCLKF', bot_id: 'B1', text: 'dashboard' },
    });
    assert.equal(client.chat.postMessage.mock.callCount(), 0);
  });

  it('stays quiet when a link cannot be issued', async () => {
    const { handler, client, auth, logger } = createHarness();
    auth.issueMagicLink = mock.fn(() => {
      throw new Error('no');
    });
    await handler(directMessage('dashboard'));
    assert.equal(client.chat.postMessage.mock.callCount(), 0);
    assert.equal(logger.error.mock.callCount(), 1);
  });
});
