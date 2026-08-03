export function formatUserGroupMention(userGroupId) {
  if (!userGroupId) {
    return '';
  }

  return `<!subteam^${userGroupId}>`;
}

function trimOrEmpty(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export function formatDailyUpdateMessage({
  userGroupId,
  mainUpdateText,
  songText,
  eventText,
  questionText,
  includeQuestion = false,
}) {
  const messageSections = [];
  const groupMention = formatUserGroupMention(userGroupId);

  if (groupMention) {
    messageSections.push(groupMention);
  }

  messageSections.push('*DAILY UPDATE*');

  const updateBody = trimOrEmpty(mainUpdateText);
  if (updateBody) {
    messageSections.push(updateBody);
  }

  if (includeQuestion && trimOrEmpty(questionText)) {
    messageSections.push(`*Daily Question*\n${trimOrEmpty(questionText)}`);
  }

  const footerLines = [];
  const songLine = trimOrEmpty(songText);
  const eventLine = trimOrEmpty(eventText);

  if (songLine) {
    footerLines.push(`Song of the Day: ${songLine}`);
  }

  if (eventLine) {
    footerLines.push(`Event of the Day: ${eventLine}`);
  }

  if (footerLines.length > 0) {
    messageSections.push('----------');
    messageSections.push(...footerLines);
  }

  return messageSections.join('\n\n');
}

export function formatDailyQuestionMessage(questionText, introText = 'Reply to this message in a thread!') {
  return ['❓ Daily Question', trimOrEmpty(questionText), trimOrEmpty(introText)].filter(Boolean).join('\n\n');
}

export function replaceWelcomePlaceholders(templateText, { userId }) {
  const template = trimOrEmpty(templateText) || 'Welcome {user}! 🎉';
  return template.replaceAll('{user}', `<@${userId}>`);
}

export function normalizeQuestionText(questionText) {
  return trimOrEmpty(questionText)
    .replace(/^[-*\d.\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/["“”]+$/g, '')
    .replace(/^['"“”]+/g, '')
    .trim();
}

export function isRepeatedQuestion(questionText, recentQuestions) {
  const candidate = normalizeQuestionText(questionText).toLowerCase();
  if (!candidate) {
    return true;
  }

  return recentQuestions.some(
    (previousQuestion) => normalizeQuestionText(previousQuestion).toLowerCase() === candidate,
  );
}
