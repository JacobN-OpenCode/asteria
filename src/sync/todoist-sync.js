/**
 * Orchestrates two-way sync between a Slack List and Todoist.
 * @typedef {import('./types.js').SyncServiceDeps} SyncServiceDeps
 * @typedef {import('./types.js').SyncSettings} SyncSettings
 */
import { createSlackListClient } from './slack-lists.js';
import { createTodoistClient } from './todoist-client.js';

/**
 * @param {SyncServiceDeps} deps
 */
export function createTodoistSync({ store, client, logger, environment, todoistClientFactory }) {
  const syncListClient = createSlackListClient({ client, logger });

  const todoistClientsByToken = new Map();

  /**
   * @param {string} apiToken
   */
  function todoistClient(apiToken) {
    let instance = todoistClientsByToken.get(apiToken);
    if (!instance) {
      const createClient = todoistClientFactory ?? createTodoistClient;
      instance = createClient({
        apiToken,
        baseUrl: environment.todoistApiBaseUrl ?? 'https://api.todoist.com/api/v1',
        logger,
      });
      todoistClientsByToken.set(apiToken, instance);
    }
    return instance;
  }

  /**
   * @param {string} addedBy
   * @param {string|null|undefined} dueDate
   */
  function buildDescription(addedBy, dueDate) {
    const nowIso = new Date().toISOString();
    const dueDateLine = dueDate ? `Due: ${dueDate}` : '';
    const addedByText = addedBy ? `<@${addedBy}>` : 'Unknown';
    return [`Added by: ${addedByText}`, `Created: ${nowIso}`, dueDateLine, `Last Updated: ${nowIso}`]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * @param {SyncSettings} settings
   */
  async function syncFromSlack(settings) {
    if (!settings.todoist_api_token || !settings.slack_list_id) {
      return;
    }

    const client = todoistClient(settings.todoist_api_token);
    const projectName = settings.todoist_project_name || 'Public Slack To Do List';

    const { items, columnMap } = await syncListClient.listItems(settings.slack_list_id);

    for (const item of items) {
      const slackItemId = item.id;
      const name = syncListClient.extractItemName(item, columnMap);
      const isCompleted = syncListClient.extractCompletion(item, columnMap);
      const dueDate = syncListClient.extractDueDate(item, columnMap);
      const addedBy = syncListClient.extractAddedBy(item);
      const fingerprint = `${name}|${isCompleted}|${dueDate ?? ''}`;

      const existingSyncItem = store.getSyncItemBySlackItemId(slackItemId);

      if (!existingSyncItem) {
        const description = buildDescription(addedBy, dueDate);
        const task = await client.addTask({
          content: name,
          description,
          dueDate,
          projectName,
        });

        if (isCompleted) {
          await client.completeTask(task.id);
        }

        store.upsertSyncItem({
          slackItemId,
          todoistTaskId: task.id,
          addedBy,
          isCompleted,
          nameHash: fingerprint,
        });
        continue;
      }

      if (Boolean(existingSyncItem.is_completed) === isCompleted && existingSyncItem.name_hash === fingerprint) {
        continue;
      }

      await client.updateTask({
        taskId: existingSyncItem.todoist_task_id,
        content: name,
        description: buildDescription(addedBy, dueDate),
        dueDate,
      });

      if (!existingSyncItem.is_completed && isCompleted) {
        await client.completeTask(existingSyncItem.todoist_task_id);
      } else if (existingSyncItem.is_completed && !isCompleted) {
        await client.reopenTask(existingSyncItem.todoist_task_id);
      }

      store.updateSyncItemCompletion(existingSyncItem.todoist_task_id, isCompleted, fingerprint);
    }
  }

  /**
   * Handle a Todoist webhook event.
   * @param {{ event_name: string, event_data?: { id?: string, content?: string } }} event
   * @param {SyncSettings} settings
   */
  async function handleTodoistEvent(event, settings) {
    if (!settings.slack_list_id) {
      return;
    }

    const todoistTaskId = event.event_data?.id;
    if (!todoistTaskId) {
      return;
    }

    const existingSyncItem = store.getSyncItemByTodoistTaskId(String(todoistTaskId));
    if (!existingSyncItem) {
      return;
    }

    if (event.event_name === 'item:completed') {
      const name = event.event_data?.content ?? String(existingSyncItem.name_hash.split('|')[0] || 'Task');
      await syncListClient.setItemCompletion({
        listId: settings.slack_list_id,
        itemId: existingSyncItem.slack_item_id,
        completed: true,
        columnMap: await loadColumnMap(settings.slack_list_id),
      });
      store.updateSyncItemCompletion(todoistTaskId, true);
      await postCompletionMessage(settings, name, existingSyncItem.added_by);
    }
  }

  /**
   * @param {string} listId
   */
  async function loadColumnMap(listId) {
    const { columnMap } = await syncListClient.listItems(listId, 1);
    return columnMap;
  }

  /**
   * @param {SyncSettings} settings
   * @param {string} taskName
   * @param {string} addedBy
   */
  async function postCompletionMessage(settings, taskName, addedBy) {
    if (!settings.notification_channel_id) {
      return;
    }
    const addedByText = addedBy ? `<@${addedBy}>` : 'someone';
    try {
      await client.chat.postMessage({
        channel: settings.notification_channel_id,
        text: `Task Completed: ${taskName} (originally added by ${addedByText})`,
      });
    } catch (error) {
      logger?.error?.('Failed to post sync completion message', error);
    }
  }

  return {
    /** @param {SyncSettings} settings */
    syncOnce: async (settings) => {
      try {
        await syncFromSlack(settings);
      } catch (error) {
        logger?.error?.('Todoist sync tick failed', error);
      }
    },
    handleTodoistEvent,
    loadColumnMap,
  };
}
