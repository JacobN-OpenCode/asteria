import { DateTime } from 'luxon';

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeValue(timeValue, fallback = '09:00') {
  if (typeof timeValue !== 'string') {
    return fallback;
  }

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeValue.trim());
  if (!match) {
    return fallback;
  }

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function parseClockTime(timeValue) {
  const normalizedTime = normalizeTimeValue(timeValue, '00:00');
  const [hourText, minuteText] = normalizedTime.split(':');
  return {
    hour: Number.parseInt(hourText, 10),
    minute: Number.parseInt(minuteText, 10),
  };
}

export function getDateTimeInZone(now, timeZone) {
  const dateTime = now ? DateTime.fromJSDate(now) : DateTime.utc();
  return dateTime.setZone(timeZone);
}

export function getLocalDateKey(now, timeZone) {
  return getDateTimeInZone(now, timeZone).toISODate();
}

export function isDueAtClock(now, timeZone, timeValue) {
  const zoneDateTime = getDateTimeInZone(now, timeZone);
  const { hour, minute } = parseClockTime(timeValue);
  const nowMinutes = zoneDateTime.hour * 60 + zoneDateTime.minute;
  const targetMinutes = hour * 60 + minute;

  return nowMinutes >= targetMinutes;
}

export function formatClockLabel(timeValue) {
  return normalizeTimeValue(timeValue, '09:00');
}

export function getDefaultQuestionTopics() {
  return ['fun', 'school', 'technology', 'creativity', 'music', 'food', 'hobbies', 'random'];
}
