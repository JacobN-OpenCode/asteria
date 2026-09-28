/**
 * Repair huddles that were closed by the old stale sweep.
 *
 * That sweep recorded the end of a huddle as `started_at + 12h` whenever it gave
 * up waiting for a leave event, so a huddle that genuinely lasted nine minutes
 * was stored as 720. Every recent "ended" huddle on the live database had a
 * duration of exactly 43200 seconds, which is what made the site read as though
 * people were in huddles for half a day.
 *
 * The real end time is not recoverable for all of them, but it is bounded: the
 * last moment we recorded any of its members being present is the last moment we
 * have any evidence the huddle was running. So each one is closed at that point
 * instead, which is honest: the huddle was at least that long and we know it was
 * not running for twelve hours after everyone had stopped appearing.
 *
 * Awarded points are deliberately left alone. They were scored against the
 * durations as recorded at the time, and rewriting somebody's score on the
 * strength of a repair is not a call this script gets to make. This changes the
 * durations the site displays, not the leaderboard.
 *
 * Safe to run more than once: it only touches rows still carrying the exact
 * placeholder, and each is rewritten to a value strictly inside the window.
 */
export function repairPlaceholderDurations(store, { logger } = {}) {
  if (!store?.repairPlaceholderHuddleEnds) {
    return null;
  }
  const result = store.repairPlaceholderHuddleEnds();
  if (!result.rows) {
    logger?.info?.('[durations] no placeholder huddle ends to repair');
    return result;
  }
  logger?.info?.(
    `[durations] repaired ${result.rows} huddles left at the 12h placeholder, ` +
      `median duration now ${result.medianSeconds}s`,
  );
  return result;
}
