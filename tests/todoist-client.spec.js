import assert from 'node:assert';
import { test } from 'node:test';
import { createTodoistClient } from '../src/sync/todoist-client.js';

const noopLogger = { warn() {}, error() {} };

function mockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options = {}) => handler(String(url), options);
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Todoist client', async (t) => {
  await t.test('creates a task in an existing project from the paginated v1 projects payload', async () => {
    const calls = [];
    const restore = mockFetch((url, options) => {
      calls.push({ url, method: options.method ?? 'GET', body: options.body });
      if (url.endsWith('/projects?limit=200')) {
        return Promise.resolve(
          jsonResponse(200, { results: [{ id: 'proj-abc', name: 'Public Slack To Do List' }], next_cursor: null }),
        );
      }
      if (url.endsWith('/tasks')) {
        return Promise.resolve(jsonResponse(200, { id: 'task-123', content: 'Do the thing' }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    try {
      const client = createTodoistClient({
        apiToken: 'tok',
        baseUrl: 'https://api.todoist.com/api/v1',
        logger: noopLogger,
      });
      const task = await client.addTask({
        content: 'Do the thing',
        description: 'Added by <@U123>',
        dueDate: '2026-09-22',
        projectName: 'Public Slack To Do List',
      });
      assert.equal(task.id, 'task-123');
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, 'https://api.todoist.com/api/v1/projects?limit=200');
      const createCall = JSON.parse(calls[1].body);
      assert.equal(createCall.project_id, 'proj-abc');
      assert.equal(createCall.due_date, '2026-09-22');
      assert.ok(!('Idempotency-Key' in calls[1]));
      assert.ok(!('X-Request-Id' in calls[1]));
    } finally {
      restore();
    }
  });

  await t.test('creates the project when it does not exist yet', async () => {
    const calls = [];
    const restore = mockFetch((url) => {
      calls.push(url);
      if (url.endsWith('/projects?limit=200')) {
        return Promise.resolve(jsonResponse(200, { results: [], next_cursor: null }));
      }
      if (url.endsWith('/projects')) {
        return Promise.resolve(jsonResponse(200, { id: 'proj-new', name: 'My List' }));
      }
      if (url.endsWith('/tasks')) {
        return Promise.resolve(jsonResponse(200, { id: 'task-1' }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    try {
      const client = createTodoistClient({
        apiToken: 'tok',
        baseUrl: 'https://api.todoist.com/api/v1',
        logger: noopLogger,
      });
      await client.addTask({ content: 'X', description: '', projectName: 'My List' });
      assert.equal(calls[1], 'https://api.todoist.com/api/v1/projects');
    } finally {
      restore();
    }
  });

  await t.test('complete and reopen tolerate v1 empty-body 200 responses', async () => {
    const restore = mockFetch((url) => {
      if (
        url === 'https://api.todoist.com/api/v1/tasks/task-9/close' ||
        url === 'https://api.todoist.com/api/v1/tasks/task-9/reopen'
      ) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    try {
      const client = createTodoistClient({
        apiToken: 'tok',
        baseUrl: 'https://api.todoist.com/api/v1',
        logger: noopLogger,
      });
      await client.completeTask('task-9');
      await client.reopenTask('task-9');
    } finally {
      restore();
    }
  });

  await t.test('throws on deprecated endpoints', async () => {
    const restore = mockFetch(() => Promise.resolve(new Response('This endpoint is deprecated.', { status: 410 })));
    try {
      const client = createTodoistClient({
        apiToken: 'tok',
        baseUrl: 'https://api.todoist.com/rest/v2',
        logger: noopLogger,
        maxRetries: 1,
      });
      await assert.rejects(() => client.addTask({ content: 'X', description: '', projectName: 'N' }), /410/);
    } finally {
      restore();
    }
  });
});
