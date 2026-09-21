/**
 * Shared type definitions for the Todoist <-> Slack List sync feature.
 */

/**
 * @typedef {object} SlackListColumn
 * @property {string} id
 * @property {string} type
 * @property {boolean} [is_primary_column]
 * @property {string} [facet_type]
 */

/**
 * @typedef {object} SlackListField
 * @property {string} column_id
 * @property {string} [type]
 * @property {string} [text]
 * @property {string} [value]
 * @property {Array<{ elements?: Array<{ type?: string, text?: string, elements?: Array<object> }> }>|null} [rich_text]
 * @property {Array<boolean>|null} [checkbox]
 * @property {Array<string>|null} [date]
 */

/**
 * @typedef {object} SlackListItem
 * @property {string} id
 * @property {Array<SlackListField>} [fields]
 * @property {string} [created_by]
 * @property {string} [createdBy]
 */

/**
 * @typedef {object} SlackListItemsApi
 * @property {(params: { list_id: string, include_list?: boolean, limit?: number }) => Promise<SlackListListResponse>} list
 * @property {(params: { list_id: string, initial_fields: Array<object> }) => Promise<SlackListCreateResponse>} create
 * @property {(params: { list_id: string, cells: Array<object> }) => Promise<object>} update
 */

/**
 * @typedef {object} SlackListListResponse
 * @property {object} [list]
 * @property {object} [list.list_metadata]
 * @property {Array<SlackListColumn>} [list.list_metadata.schema]
 * @property {Array<SlackListColumn>} [list.schema]
 * @property {Array<SlackListItem>} [items]
 */

/**
 * @typedef {object} SlackListCreateResponse
 * @property {SlackListItem} [item]
 */

/**
 * @typedef {object} SlackClient
 * @property {{ items: SlackListItemsApi }} slackLists
 * @property {{ postMessage: (params: { channel: string, text: string }) => Promise<object> }} chat
 */

/**
 * @typedef {object} TodoistTask
 * @property {string} id
 * @property {string} [content]
 */

/**
 * @typedef {object} TodoistClient
 * @property {(input: { content: string, description: string, dueDate?: string|null, projectName: string }) => Promise<TodoistTask>} addTask
 * @property {(input: { taskId: string, content: string, description: string, dueDate?: string|null }) => Promise<TodoistTask>} updateTask
 * @property {(taskId: string) => Promise<void>} completeTask
 * @property {(taskId: string) => Promise<void>} reopenTask
 */

/**
 * @typedef {object} TodoistClientDeps
 * @property {string} apiToken
 * @property {string} baseUrl
 * @property {{ warn?: (msg: string, extra?: object) => void, error?: (msg: string, extra?: object) => void }} [logger]
 * @property {number} [maxRetries]
 */

/**
 * @typedef {object} SlackListDeps
 * @property {SlackClient} client
 * @property {{ warn?: (msg: string, extra?: object) => void }} [logger]
 */

/**
 * @typedef {object} SyncSettings
 * @property {boolean} enabled
 * @property {string} todoist_api_token
 * @property {string} slack_list_id
 * @property {string} todoist_project_name
 * @property {string} notification_channel_id
 * @property {number} poll_interval_seconds
 * @property {string} webhook_secret
 */

/**
 * @typedef {object} SyncItem
 * @property {string} slack_item_id
 * @property {string} todoist_task_id
 * @property {number} is_completed
 * @property {string} name_hash
 * @property {string} added_by
 */

/**
 * @typedef {object} SyncEnvironment
 * @property {string} [todoistApiBaseUrl]
 * @property {number} [maxRetries]
 */

/**
 * @typedef {object} SyncStore
 * @property {() => SyncSettings} getSyncSettings
 * @property {(patch: Partial<SyncSettings>) => SyncSettings} updateSyncSettings
 * @property {() => Array<SyncItem>} listSyncItems
 * @property {(slackItemId: string) => SyncItem|null} getSyncItemBySlackItemId
 * @property {(todoistTaskId: string) => SyncItem|null} getSyncItemByTodoistTaskId
 * @property {(input: object) => SyncItem} upsertSyncItem
 * @property {(todoistTaskId: string, isCompleted: boolean, nameHash?: string) => SyncItem|null} updateSyncItemCompletion
 */

/**
 * @typedef {object} SyncServiceDeps
 * @property {SyncStore} store
 * @property {SlackClient} client
 * @property {{ warn?: (msg: string, extra?: object) => void, error?: (msg: string, extra?: object) => void, info?: (msg: string, extra?: object) => void }} logger
 * @property {SyncEnvironment} environment
 * @property {(deps: TodoistClientDeps) => TodoistClient} [todoistClientFactory]
 */

export {};
