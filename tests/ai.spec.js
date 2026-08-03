import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { createHackClubAiService } from '../src/services/ai.js';

describe('Hack Club AI integration', () => {
  it('sends the configured model and question context to the OpenAI-compatible endpoint', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock.fn(async (url, options) => {
      assert.equal(url, 'https://ai.hackclub.com/proxy/v1/chat/completions');
      assert.equal(options.method, 'POST');

      const requestBody = JSON.parse(options.body);
      assert.equal(requestBody.model, 'qwen/qwen3-32b');
      assert(requestBody.messages[1].content.includes('You are TestBot, a Slack companion bot'));
      assert(requestBody.messages[1].content.includes('Topics: fun, music'));
      assert(requestBody.messages[1].content.includes('Avoid repeating these recent questions:'));
      assert(requestBody.messages[1].content.includes('- What is your favorite snack?'));

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'What is one thing you are excited to build next?',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    globalThis.fetch = fetchMock;

    try {
      const aiService = createHackClubAiService({
        apiKey: 'test-key',
        baseUrl: 'https://ai.hackclub.com/proxy/v1',
        model: 'qwen/qwen3-32b',
        logger: {
          warn: mock.fn(),
        },
      });

      const result = await aiService.generateDailyQuestion({
        topics: ['fun', 'music'],
        tone: 'friendly',
        customInstructions: 'Keep it short',
        recentQuestions: ['What is your favorite snack?'],
        botName: 'TestBot',
      });

      assert.equal(result.questionText, 'What is one thing you are excited to build next?');
      assert.match(result.questionHash, /^[a-f0-9]{64}$/);
      assert(fetchMock.mock.callCount() > 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
