/**
 * Slack Lists API wrapper for the sync feature.
 * @typedef {import('./types.js').SlackListItem} SlackListItem
 * @typedef {import('./types.js').SlackListColumn} SlackListColumn
 * @typedef {import('./types.js').SlackListDeps} SlackListDeps
 * @typedef {import('./types.js').SlackListField} SlackListField
 */

const COLUMN_TYPE_TEXT = 'text';
const COLUMN_TYPE_CHECKBOX = 'checkbox';
const COLUMN_TYPE_DATE = 'date';

/**
 * @param {SlackListDeps} deps
 */
export function createSlackListClient({ client }) {
  function requireListId(listId) {
    if (!listId) {
      throw new Error('Slack List ID is not configured');
    }
    return listId;
  }

  /**
   * Fetch items plus the list schema (columns) for a list.
   * @param {string} inputListId
   * @param {number} [limit]
   */
  async function listItems(inputListId, limit = 100) {
    const listId = requireListId(inputListId);
    const response = await client.slackLists.items.list({ list_id: listId, include_list: true, limit });
    const columns = Array.isArray(response?.list?.schema) ? response.list.schema : [];
    const columnMap = new Map(columns.map((column) => [column.id, column]));
    const items = Array.isArray(response?.items) ? response.items : [];
    return { items, columns, columnMap };
  }

  /**
   * Extract the plain-text "name" of a list item. Prefers the primary text column;
   * falls back to the first text column.
   * @param {SlackListItem} item
   * @param {Map<string, SlackListColumn>} columnMap
   */
  function extractItemName(item, columnMap) {
    const fields = Array.isArray(item?.fields) ? item.fields : [];
    const byColumn = new Map(fields.map((field) => [field?.column_id, field]));

    const primaryColumn = Array.from(columnMap.values()).find(
      (column) => column.is_primary_column || column.type === COLUMN_TYPE_TEXT,
    );
    const targetColumnId =
      primaryColumn?.id ?? Array.from(columnMap.values()).find((column) => column.type === COLUMN_TYPE_TEXT)?.id;
    if (!targetColumnId) {
      return '';
    }

    const field = byColumn.get(targetColumnId);
    return extractFieldText(field);
  }

  /**
   * @param {SlackListField|undefined} field
   */
  function extractFieldText(field) {
    if (!field) {
      return '';
    }
    if (typeof field.text === 'string') {
      return field.text;
    }
    if (typeof field.value === 'string') {
      return field.value;
    }
    const richText = field.rich_text;
    if (Array.isArray(richText)) {
      return flattenRichText(richText);
    }
    return '';
  }

  /**
   * @param {Array<{ elements?: Array<{ type?: string, text?: string, elements?: Array<object> }> }>} richTextBlocks
   */
  function flattenRichText(richTextBlocks) {
    const parts = [];
    for (const block of richTextBlocks) {
      const elements = Array.isArray(block?.elements) ? block.elements : [];
      for (const element of elements) {
        if (element?.type === 'text' && typeof element.text === 'string') {
          parts.push(element.text);
        }
        if (Array.isArray(element?.elements)) {
          parts.push(flattenRichText(element.elements));
        }
      }
    }
    return parts.join('');
  }

  /**
   * @param {SlackListItem} item
   * @param {Map<string, SlackListColumn>} columnMap
   */
  function extractCompletion(item, columnMap) {
    const fields = Array.isArray(item?.fields) ? item.fields : [];
    const checkboxColumn = Array.from(columnMap.values()).find(
      (column) => column.type === COLUMN_TYPE_CHECKBOX || column.facet_type === 'todo_completed',
    );
    if (!checkboxColumn) {
      return false;
    }
    const field = fields.find((candidate) => candidate.column_id === checkboxColumn.id);
    if (!field) {
      return false;
    }
    if (Array.isArray(field.checkbox)) {
      return Boolean(field.checkbox[0]);
    }
    return field.checkbox === true;
  }

  /**
   * @param {SlackListItem} item
   * @param {Map<string, SlackListColumn>} columnMap
   */
  function extractDueDate(item, columnMap) {
    const fields = Array.isArray(item?.fields) ? item.fields : [];
    const dateColumn = Array.from(columnMap.values()).find(
      (column) => column.type === COLUMN_TYPE_DATE || column.facet_type === 'todo_due_date',
    );
    if (!dateColumn) {
      return null;
    }
    const field = fields.find((candidate) => candidate.column_id === dateColumn.id);
    if (!field) {
      return null;
    }
    if (Array.isArray(field.date) && typeof field.date[0] === 'string') {
      return field.date[0];
    }
    if (typeof field.value === 'string') {
      return field.value;
    }
    return null;
  }

  /**
   * @param {SlackListItem} item
   */
  function extractAddedBy(item) {
    return item?.created_by ?? item?.createdBy ?? '';
  }

  /**
   * Mark a list item's checkbox column as completed (or not).
   * @param {{ listId: string, itemId: string, completed: boolean, columnMap: Map<string, SlackListColumn> }} input
   */
  async function setItemCompletion(input) {
    const listId = requireListId(input.listId);
    const checkboxColumn = Array.from(input.columnMap.values()).find(
      (column) => column.type === COLUMN_TYPE_CHECKBOX || column.facet_type === 'todo_completed',
    );
    if (!checkboxColumn) {
      throw new Error('List has no checkbox column to complete items against');
    }
    await client.slackLists.items.update({
      list_id: listId,
      cells: [{ row_id: input.itemId, column_id: checkboxColumn.id, checkbox: input.completed }],
    });
  }

  /**
   * Create a new item in the list with the given name (primary text column).
   * @param {{ listId: string, name: string, columnMap: Map<string, SlackListColumn> }} input
   */
  async function addItem(input) {
    const listId = requireListId(input.listId);
    const primaryColumn = Array.from(input.columnMap.values()).find(
      (column) => column.is_primary_column || column.type === COLUMN_TYPE_TEXT,
    );
    const columnId =
      primaryColumn?.id ?? Array.from(input.columnMap.values()).find((column) => column.type === COLUMN_TYPE_TEXT)?.id;
    if (!columnId) {
      throw new Error('List has no text column to create items against');
    }
    const response = await client.slackLists.items.create({
      list_id: listId,
      initial_fields: [{ column_id: columnId, text: input.name }],
    });
    return response?.item ?? response;
  }

  return {
    listItems,
    extractItemName,
    extractCompletion,
    extractDueDate,
    extractAddedBy,
    setItemCompletion,
    addItem,
  };
}
