/**
 * Turning a list of attendance intervals into per-person totals.
 *
 * This is deliberately a pure function of its inputs, with no database and no
 * clock. Two reasons:
 *
 *  1. The historical rebuild has to be able to run as a dry run and produce
 *     exactly the numbers the real run will write. If totals were read back out
 *     of the database, a dry run would have to mutate the database to be
 *     accurate, which is the opposite of a dry run.
 *  2. Interval maths is easy to get subtly wrong, and it is the maths that was
 *     wrong in the first place. One implementation, unit tested on its own.
 */

/**
 * Merge overlapping and touching intervals into disjoint spans.
 *
 * Without this, two overlapping rows for the same person are added together and
 * the shared stretch is counted twice. Slack delivers duplicate events and
 * overlapping stretches, so this is not hypothetical.
 */
export function mergeIntervals(spans) {
  const sorted = spans
    .map((span) => ({ from: Number(span.from) || 0, to: Number(span.to) || 0 }))
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  if (sorted.length === 0) {
    return [];
  }
  const merged = [{ from: sorted[0].from, to: sorted[0].to }];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    // `<=` so a leave and a rejoin in the same second are one continuous stretch
    // rather than two that both claim that second.
    if (span.from <= last.to) {
      last.to = Math.max(last.to, span.to);
    } else {
      merged.push({ from: span.from, to: span.to });
    }
  }
  return merged;
}

/** Total length covered by a set of spans, having already merged them. */
function totalLength(spans) {
  return spans.reduce((sum, span) => sum + (span.to - span.from), 0);
}

/**
 * Summarise attendance rows into per-person provable seconds.
 *
 * The rules, all of which exist to avoid inventing time we cannot prove:
 *
 *  - An interval that was never closed contributes nothing. We know somebody
 *    arrived, not when they left, so the huddle is marked partial instead.
 *  - An interval we closed ourselves (inferred) is a ceiling, not proof. It
 *    counts towards how long somebody might have been there, never towards what
 *    they score.
 *  - Everything is clipped to the call's own start and end.
 *  - Intervals are unioned per person before summing, so an overlap cannot be
 *    counted twice.
 *  - Provable seconds are the part of a person's presence that is backed by at
 *    least one proven interval. A proven stretch still scores even if an
 *    inferred one is fused onto it, because that stretch is genuinely provable.
 *  - Nobody can be present for longer than the call lasted.
 *
 * @param {Array<{user_id: string, joined_at: number, left_at: number|null, inferred?: number}>} rows
 * @param {{startedAt?: number, endedAt?: number|null}} bounds
 */
export function summariseAttendance(rows, { startedAt = null, endedAt = null } = {}) {
  const byUser = new Map();
  let partial = false;

  for (const row of rows) {
    const userId = row.user_id;
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        seconds: 0,
        ceilingSeconds: 0,
        intervals: [],
        provenSpans: [],
        inferredSpans: [],
        partial: false,
      });
    }
    const entry = byUser.get(userId);
    let from = Number(row.joined_at) || 0;
    let to = row.left_at == null ? null : Number(row.left_at);
    if (to == null) {
      // Never closed: provable that they arrived, not when they went.
      entry.partial = true;
      partial = true;
      continue;
    }
    if (startedAt != null && from < startedAt) {
      from = startedAt;
    }
    if (endedAt && to > endedAt) {
      to = endedAt;
    }
    if (to <= from) {
      continue;
    }
    const span = { from, to };
    entry.intervals.push(span);
    if (Number(row.inferred) === 1) {
      // We supplied this end time ourselves, so it is a ceiling, not proof.
      entry.partial = true;
      partial = true;
      entry.inferredSpans.push(span);
    } else {
      entry.provenSpans.push(span);
    }
  }

  // null means "we do not know the bound", which is different from a bound of 0.
  const cap = startedAt != null && endedAt ? Math.max(0, Number(endedAt) - Number(startedAt)) : null;

  for (const entry of byUser.values()) {
    const proven = mergeIntervals(entry.provenSpans);
    const all = mergeIntervals(entry.provenSpans.concat(entry.inferredSpans));
    entry.intervals = all;
    delete entry.provenSpans;
    delete entry.inferredSpans;

    // How long they might have been there, and how much of it is provable. A
    // proven stretch still scores even when an inferred one is fused onto it,
    // because that stretch is genuinely provable on its own.
    entry.ceilingSeconds = totalLength(all);
    entry.seconds = totalLength(proven);

    if (cap != null) {
      entry.seconds = Math.min(entry.seconds, cap);
      entry.ceilingSeconds = Math.min(entry.ceilingSeconds, cap);
    }
  }

  return { participants: [...byUser.values()], partial };
}
