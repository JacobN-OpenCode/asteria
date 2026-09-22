/**
 * Thin Todoist v1 (unified) API client with project caching and 429 rate-limit backoff.
 * Builds on the REST endpoints under /api/v1 (tasks, projects).
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
   */
  async function request(path, { method = 'GET', body } = {}) {
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

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

      const text = await response.text().catch(() => '');
      if (!text) {
        return null;
      }
      return JSON.parse(text);
    }
  }

  async function ensureProject(name) {
    if (cachedProjectId && cachedProjectName === name) {
      return cachedProjectId;
    }

    const projectsResponse = await request('/projects?limit=200');
    const projects = Array.isArray(projectsResponse)
      ? projectsResponse
      : Array.isArray(projectsResponse?.results)
        ? projectsResponse.results
        : [];
    const matchingProject = projects.find((project) => project.name === name);
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
