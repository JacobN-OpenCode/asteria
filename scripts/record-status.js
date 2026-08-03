import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendStatusEvent } from '../src/status/status-core.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eventsFilePath = process.env.ASTERIA_STATUS_FILE || path.join(repoRoot, 'data', 'status-events.json');

const state = process.argv[2];
const detail = process.argv[3] ?? '';

if (state !== 'up' && state !== 'down') {
  console.error('Usage: node scripts/record-status.js <up|down> [detail]');
  process.exit(1);
}

appendStatusEvent(eventsFilePath, state, detail);
