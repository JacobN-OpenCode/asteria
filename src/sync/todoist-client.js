/**
 * Thin Todoist REST v2 client with project caching and 429 rate-limit backoff.
 * @typedef {import('./types.js').TodoistClientDeps} TodoistClientDeps
 */
import { sleep } from './util.js';

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_BASE_MS = 500;

/**
 * @param {TodoistClientDeps} deps
 */
export function createTodoistClient({ apiToken, baseUrl, logger, maxRetries = DEFAULT_MAX_RETRIES }) {
  if (!apiToken) {
    throw new Error('Todoist API token is required');
  }

  let cachedProjectId = null;
  let cachedProjectName = '';

  /**
   * @param {string} path
   * @param {object} [options]
   * @param {'GET'|'POST'} [options.method]
   * @param {object} [options.body]
   * @param {string} [options.idempotencyKey] UUID for POST commands so retries are safe.
   */
  async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
    if (body) {
      headers['Idempotency-Key'] = idempotencyKey ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    }

    let attempt = 0;
    for (;;) {
      let response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        logger?.warn('Todoist request network failure', { path, error: String(error) });
        attempt += 1;
        if (attempt >= maxRetries) {
          throw error;
        }
        const delay = DEFAULT_RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250);
        await sleep(delay);
        continue;
      }

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfterMs = Number(response.headers.get('retry-after')) * 1000;
        const delay = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1000;
        logger?.warn('Todoist rate limited, backing off', { path, retryAfterMs: delay });
        attempt += 1;
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Todoist API error ${response.status} for ${path}: ${errorText}`);
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    }
  }

  async function ensureProject(name) {
    if (cachedProjectId && cachedProjectName === name) {
      return cachedProjectId;
    }

    const projects = await request('/projects');
    const matchingProject = (Array.isArray(projects) ? projects : []).find((project) => project.name === name);
    if (matchingProject) {
      cachedProjectId = matchingProject.id;
      cachedProjectName = name;
      return cachedProjectId;
    }

    const createdProject = await request('/projects', {
      method: 'POST',
      body: { name },
    });
    cachedProjectId = createdProject.id;
    cachedProjectName = name;
    return cachedProjectId;
  }

  return {
    /**
     * @param {{ content: string, description: string, dueDate?: string|null, projectName: string }} input
     */
    async addTask(input) {
      const projectId = await ensureProject(input.projectName);
      const task = await request('/tasks', {
        method: 'POST',
        body: {
          content: input.content,
          description: input.description,
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
          project_id: projectId,
        },
      });
      return task;
    },

    /**
     * @param {{ taskId: string, content: string, description: string, dueDate?: string|null }} input
     */
    async updateTask(input) {
      const task = await request(`/tasks/${input.taskId}`, {
        method: 'POST',
        body: {
          content: input.content,
          description: input.description,
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
        },
      });
      return task;
    },

    /**
     * @param {string} taskId
     */
    async completeTask(taskId) {
      await request(`/tasks/${taskId}/close`, { method: 'POST', body: {} });
    },

    /**
     * @param {string} taskId
     */
    async reopenTask(taskId) {
      await request(`/tasks/${taskId}/reopen`, { method: 'POST', body: {} });
    },
  };
}
