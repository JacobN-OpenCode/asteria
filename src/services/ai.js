import crypto from 'node:crypto';
import { formatDailyQuestionMessage, isRepeatedQuestion, normalizeQuestionText } from '../utils/messages.js';

function safeTrim(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function createFallbackQuestion(topics) {
  const topic = Array.isArray(topics) && topics.length > 0 ? topics[0] : 'today';
  const fallbackQuestions = [
    `What is one small win you had related to ${topic}?`,
    `What is something about ${topic} that you are curious about right now?`,
    `If you could make ${topic} more fun, what would you change?`,
    `What is your favorite thing you have learned about ${topic} lately?`,
  ];

  return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
}

function cleanAiQuestionText(rawText) {
  const lines = safeTrim(rawText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  let questionText = lines[0]
    .replace(/^[-*\d.\s]+/, '')
    .replace(/^question[:\s-]*/i, '')
    .replace(/^['"“”]+/, '')
    .replace(/['"“”]+$/, '')
    .trim();

  if (!questionText.includes('?')) {
    questionText = `${questionText.replace(/[.。]$/, '').trim()}?`;
  }

  return normalizeQuestionText(questionText);
}

export function createHackClubAiService({ apiKey, baseUrl, model, logger }) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  async function requestQuestion(messages) {
    const response = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        max_tokens: 128,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Hack Club AI request failed with ${response.status}: ${bodyText}`);
    }

    const responseBody = await response.json();
    const content = responseBody?.choices?.[0]?.message?.content;
    return safeTrim(content);
  }

  return {
    async generateDailyQuestion({ topics, tone, customInstructions, recentQuestions }) {
      const recentList = Array.isArray(recentQuestions) ? recentQuestions.slice(0, 8) : [];
      const prompt = [
        'You are Asteria, a Slack companion bot for a Hack Club personal channel.',
        'Write exactly one friendly, safe, community-appropriate question.',
        'Return only the question text with no bullets, no numbering, no markdown fence, and no preamble.',
        'The question should fit a general Hack Club/community setting and should not be overly personal, discriminatory, dangerous, or repetitive.',
        `Tone: ${safeTrim(tone) || 'friendly and curious'}.`,
        `Topics: ${(topics || []).filter(Boolean).join(', ') || 'general community conversation'}.`,
        customInstructions ? `Custom instructions: ${safeTrim(customInstructions)}` : '',
        recentList.length > 0 ? `Avoid repeating these recent questions: ${recentList.join(' || ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const messages = [
        {
          role: 'system',
          content: 'You generate one concise Slack question and nothing else.',
        },
        { role: 'user', content: prompt },
      ];

      let questionText = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          questionText = cleanAiQuestionText(await requestQuestion(messages));
        } catch (error) {
          logger?.warn?.('Hack Club AI question generation failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }

        if (questionText && !isRepeatedQuestion(questionText, recentList)) {
          break;
        }

        messages[1] = {
          role: 'user',
          content: `${prompt}\n\nThe last attempt was too similar or invalid. Try a different question.`,
        };
      }

      if (!questionText || isRepeatedQuestion(questionText, recentList)) {
        questionText = createFallbackQuestion(topics);
      }

      const questionHash = crypto.createHash('sha256').update(questionText).digest('hex');
      return {
        questionText,
        questionHash,
        previewMessage: formatDailyQuestionMessage(questionText),
      };
    },
  };
}
