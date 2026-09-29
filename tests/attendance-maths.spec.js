import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { mergeIntervals, summariseAttendance } from '../src/huddles/attendance.js';

const row = (userId, joinedAt, leftAt, inferred = 0) => ({
  user_id: userId,
  joined_at: joinedAt,
  left_at: leftAt,
  inferred,
});

function secondsFor(rows, bounds) {
  const { participants } = summariseAttendance(rows, bounds);
  const entry = participants.find((p) => p.userId === 'U1');
  return entry ? entry.seconds : 0;
}

describe('merging intervals', () => {
  test('leaves disjoint intervals alone', () => {
    assert.deepEqual(
      mergeIntervals([
        { from: 0, to: 10 },
        { from: 20, to: 30 },
      ]),
      [
        { from: 0, to: 10 },
        { from: 20, to: 30 },
      ],
    );
  });

  test('fuses overlapping intervals', () => {
    assert.deepEqual(
      mergeIntervals([
        { from: 0, to: 50 },
        { from: 20, to: 80 },
      ]),
      [{ from: 0, to: 80 }],
    );
  });

  test('treats a shared second as continuous, not two stretches', () => {
    assert.deepEqual(
      mergeIntervals([
        { from: 0, to: 10 },
        { from: 10, to: 20 },
      ]),
      [{ from: 0, to: 20 }],
    );
  });

  test('swallows a nested interval', () => {
    assert.deepEqual(
      mergeIntervals([
        { from: 0, to: 100 },
        { from: 10, to: 20 },
      ]),
      [{ from: 0, to: 100 }],
    );
  });

  test('drops empty and inverted spans', () => {
    assert.deepEqual(
      mergeIntervals([
        { from: 5, to: 5 },
        { from: 9, to: 3 },
        { from: 0, to: 4 },
      ]),
      [{ from: 0, to: 4 }],
    );
  });
});

describe('summarising provable attendance', () => {
  test('adds separate stretches', () => {
    assert.equal(
      secondsFor([row('U1', 0, 60), row('U1', 120, 180)], { startedAt: 0, endedAt: 600 }),
      120,
      'the gap between them is not attendance',
    );
  });

  test('a closed stretch counts, an unclosed one does not', () => {
    const { participants, partial } = summariseAttendance([row('U1', 0, 60), row('U1', 120, null)], {
      startedAt: 0,
      endedAt: 600,
    });
    assert.equal(participants[0].seconds, 60, 'we know the first stretch and not the second');
    assert.equal(partial, true, 'so the huddle is partial');
  });

  test('an inferred end is a ceiling and never scores', () => {
    const { participants, partial } = summariseAttendance([row('U1', 0, 600, 1)], {
      startedAt: 0,
      endedAt: 600,
    });
    assert.equal(participants[0].seconds, 0, 'we guessed the end, so nothing is provable');
    assert.equal(participants[0].ceilingSeconds, 600, 'but we still report the ceiling');
    assert.equal(partial, true);
  });

  test('a proven stretch still scores alongside an inferred one', () => {
    const { participants } = summariseAttendance([row('U1', 0, 60), row('U1', 100, 600, 1)], {
      startedAt: 0,
      endedAt: 600,
    });
    assert.equal(participants[0].seconds, 60, 'the first stretch is provable on its own');
    // 0-60 proven plus 100-600 inferred. The 60-100 gap is not presence.
    assert.equal(participants[0].ceilingSeconds, 560, 'the ceiling covers every stretch we have');
  });

  test('clips to the call boundaries', () => {
    assert.equal(secondsFor([row('U1', -500, 700)], { startedAt: 0, endedAt: 600 }), 600, 'clipped to the call');
  });

  test('never exceeds the call length even if the data does', () => {
    assert.equal(
      secondsFor([row('U1', 0, 10000), row('U1', 0, 10000)], { startedAt: 0, endedAt: 300 }),
      300,
      'capped at the call length',
    );
  });

  test('overlaps are unioned, not added', () => {
    assert.equal(
      secondsFor([row('U1', 0, 100), row('U1', 50, 200)], { startedAt: 0, endedAt: 600 }),
      200,
      'the overlap is counted once',
    );
  });

  test('an overlap between proven and inferred does not fabricate time', () => {
    // Proven 0-100 and inferred 50-200. The shared 50-100 is provable, and so is
    // 0-50, but 100-200 is only ever a guess.
    const { participants } = summariseAttendance([row('U1', 0, 100), row('U1', 50, 200, 1)], {
      startedAt: 0,
      endedAt: 600,
    });
    assert.equal(participants[0].seconds, 100, 'only the proven stretch scores');
    assert.equal(participants[0].ceilingSeconds, 200, 'the ceiling covers everything');
  });

  test('an out of order pair is dropped rather than made negative', () => {
    // The second row claims a leave before the join, which would be a negative
    // stretch. It is dropped, and the valid first row still stands.
    assert.equal(secondsFor([row('U1', 0, 100), row('U1', 0, -50)], { startedAt: 0, endedAt: 600 }), 100);
  });

  test('a zero length stretch scores nothing', () => {
    assert.equal(secondsFor([row('U1', 50, 50)], { startedAt: 0, endedAt: 600 }), 0);
  });

  test('keeps users apart', () => {
    const { participants } = summariseAttendance([row('U1', 0, 60), row('U2', 0, 180)], {
      startedAt: 0,
      endedAt: 600,
    });
    assert.equal(participants.length, 2);
    assert.equal(participants.find((p) => p.userId === 'U1').seconds, 60);
    assert.equal(participants.find((p) => p.userId === 'U2').seconds, 180);
  });
});
