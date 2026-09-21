/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Stable hash for change detection / loop prevention.
 * @param {string} input
 * @returns {string}
 */
export function hashContent(input) {
  let hash = 5381;
  const text = String(input ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return String(hash >>> 0);
}
