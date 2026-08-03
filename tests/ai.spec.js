import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { createHackClubAiService, DEFAULT_QUESTION_PROMPT } from '../src/services/ai.js';

describe('Hack Club AI integration', () => {
  it('sends the configured model and the raw prompt verbatim', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock.fn(async (url, options) => {
      assert.equal(url, 'https://ai.hackclub.com/proxy/v1/chat/completions');
      assert.equal(options.method, 'POST');

      const requestBody = JSON.parse(options.body);
      assert.equal(requestBody.model, 'qwen/qwen3-32b');
      assert.equal(requestBody.messages[0].role, 'system');
      assert.equal(
        requestBody.messages[1].content,
        'You are a test bot. Write one fun question about sailing. Return only the question text.',
      );
      assert(!requestBody.messages[1].content.includes('Topics:'));

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
        prompt: 'You are a test bot. Write one fun question about sailing. Return only the question text.',
        recentQuestions: ['What is your favorite snack?'],
      });

      assert.equal(result.questionText, 'What is one thing you are excited to build next?');
      assert.match(result.questionHash, /^[a-f0-9]{64}$/);
      assert(fetchMock.mock.callCount() > 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the default prompt when none is provided', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock.fn(async (_url, options) => {
      const requestBody = JSON.parse(options.body);
      assert.equal(requestBody.messages[1].content, DEFAULT_QUESTION_PROMPT);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'What did you build today?' } }],
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
        logger: { warn: mock.fn() },
      });

      const result = await aiService.generateDailyQuestion({ prompt: '   ', recentQuestions: [] });
      assert.equal(result.questionText, 'What did you build today?');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
