import { getPersonalContext } from './personal-contexts.js?v=20261114-tarot-first-person1';
import { buildCardConnections } from './card-connections.js?v=20261120-tarot-voice2';
import { PERSONAL_READING_BASIS } from './person-narrative.js?v=20261120-tarot-voice2';
import { getReading } from './readings.js?v=20261120-tarot-voice2';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction, directCardAdvice } from './reading-voice.js?v=20261120-tarot-voice2';
import { getPersonStory } from './person-stories.js?v=20261120-tarot-voice2';

export const PERSONAL_BASIS = PERSONAL_READING_BASIS;
const roles = ['지금 문제를 대하는 나', '지금 상황과 속마음', '이번에 바꿀 선택'];
const piece = (id, title, paragraphs, summaryLines) => ({ id, title, paragraphs, summaryLines });

export function buildPersonalReading({ cards, topicId, contextId } = {}) {
  const context = getPersonalContext(topicId, contextId);
  if (!Array.isArray(cards) || cards.length !== 3
      || new Set(cards.map(card => card?.id)).size !== 3
      || cards.some(card => !card?.id || !card.name || !Object.hasOwn(context.cards, card.id))) {
    throw new Error('tarot_personal_requires_three_actual_cards');
  }
  const names = cards.map((card, index) => {
    const name = getReading(card, topicId, index).displayName;
    return name && name !== card.name ? `${name}(${card.name})` : card.name;
  });
  const primary = cards.map((card, index) => {
    const advice = directCardAdvice(context.cards[card.id]);
    const [insight, ...actions] = splitSummarySentences(advice);
    return piece(`personal-role-${index}`, roles[index], [
      insight,
      actions.join(' ')
    ], summaryLinesFrom(insight, actions.join(' ')));
  });
  const connected = buildCardConnections({ cards, context, names });
  const connection = piece('personal-connection', '이 고민에 담긴 내 마음',
    connected.paragraphs, connected.summaryLines);
  const solution = directInterpretation(getPersonStory(cards[2].id)[context.topicId]);
  const [support, tension] = splitSummarySentences(solution);
  const comparison = {
    title: directInterpretation(context.comparison.title),
    basis: solution,
    basisSummaryLines: summaryLinesFrom(support, tension),
    options: ['a', 'b'].map(key => {
      const option = context.comparison[key];
      // These are practical tradeoffs, not claims made by the drawn card.
      const gain = directInterpretation(option.gain);
      const burden = directInterpretation(option.burden);
      const prepare = directAction(option.prepare);
      return { id: `personal-choice-${key}`, key, ...option, gain, burden, prepare,
        summaryLines: summaryLinesFrom(gain, burden, [prepare]) };
    })
  };
  const followUps = context.followUps.map(item => {
    const paragraphs = [directInterpretation(item.paragraphs[0]), directAction(item.paragraphs[1])];
    return piece(`personal-question-${item.id}`, directInterpretation(item.question), paragraphs,
      summaryLinesFrom(paragraphs[0], paragraphs[1]));
  });
  return {
    contextId, topicId, label: context.label, question: directInterpretation(context.question),
    example: directInterpretation(context.example), cards: cards.map(card => card.id), names,
    primary, connection, comparison, followUps, basis: PERSONAL_BASIS
  };
}

export function personalReadingCopyLines(report) {
  if (!report) return [];
  const lines = [`내 상황 · ${report.label}`, report.question, '', report.example, ''];
  for (const section of [report.connection, ...report.primary]) {
    lines.push(section.title, '');
    for (const paragraph of section.paragraphs) lines.push(paragraph, '');
  }
  lines.push('두 선택 비교', report.comparison.title, report.comparison.basis, '');
  for (const option of report.comparison.options) {
    lines.push(`${option.key.toUpperCase()}. ${option.label}`,
      `이 선택의 장점: ${option.gain}`, `감수할 부담: ${option.burden}`, `먼저 준비할 것: ${option.prepare}`, '');
  }
  lines.push('이어지는 질문', '');
  for (const question of report.followUps) {
    lines.push(question.title, '');
    for (const paragraph of question.paragraphs) lines.push(paragraph, '');
  }
  return lines;
}
