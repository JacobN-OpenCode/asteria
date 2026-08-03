import crypto from 'node:crypto';
import { formatDailyQuestionMessage, isRepeatedQuestion, normalizeQuestionText } from '../utils/messages.js';

export const DEFAULT_QUESTION_PROMPT = `You are a friendly Slack companion bot for a Hack Club community channel.

Write exactly one short, fun, community-appropriate question that people in the channel will want to answer.

Rules:
- Return only the question text, with no bullets, no numbering, no markdown formatting, and no preamble.
- Keep the question general enough for a Hack Club community setting.
- Do not write anything overly personal, discriminatory, dangerous, or repetitive.`;

const FALLBACK_QUESTIONS = [
  'What is one small win you had recently?',
  'What is something you are curious about right now?',
  'If you could make today more fun, what would you change?',
  'What is your favorite thing you have learned lately?',
];

function safeTrim(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function createFallbackQuestion() {
  return FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
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
    async generateDailyQuestion({ prompt, recentQuestions }) {
      const recentList = Array.isArray(recentQuestions) ? recentQuestions.slice(0, 8) : [];
      const effectivePrompt = safeTrim(prompt) || DEFAULT_QUESTION_PROMPT;

      const messages = [
        {
          role: 'system',
          content: 'You generate one concise Slack question and nothing else.',
        },
        { role: 'user', content: effectivePrompt },
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
          content: `${effectivePrompt}\n\nThe last attempt was too similar or invalid. Try a different question.`,
        };
      }

      if (!questionText || isRepeatedQuestion(questionText, recentList)) {
        questionText = createFallbackQuestion();
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
