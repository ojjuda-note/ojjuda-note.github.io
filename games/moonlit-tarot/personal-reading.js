import { getPersonalContext } from './personal-contexts.js?v=20261114-tarot-copy1';
import { buildCardConnections, getConnectionProfile } from './card-connections.js?v=20261114-tarot-copy1';
import { getReading } from './readings.js?v=20261114-tarot-copy1';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction, directCardAdvice } from './reading-voice.js?v=20261113-tarot-easy1';
import { getPersonStory } from './person-stories.js?v=20261114-tarot-copy1';

export const PERSONAL_BASIS = '고른 상황과 뽑은 세 장을 연결해 성향과 마음을 풀이해요. 실제 과거나 상대의 속마음을 확인한 결과는 아니에요. 카드 연결에는 공통 해석 규칙을 적용하고, 선택 비교와 이어지는 답변에는 생활 제안을 담았어요.';
const roles = ['지금 문제를 대하는 나', '지금 상황과 속마음', '이번에 바꿀 선택'];
const piece = (id, title, paragraphs, summaryLines) => ({ id, title, paragraphs, summaryLines });
function cardSummary(card, first, second = first) {
  const lines = summaryLinesFrom(first, second);
  lines[0] = `‘${card.name}’ 카드: ${lines[0]}`;
  return lines;
}

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
    const person = getPersonStory(card.id);
    const portrait = index === 2 ? insight : index === 1 ? `${person.longing} ${person.defense}` : person.portrait;
    return piece(`personal-role-${index}`, roles[index], [
      `‘${names[index]}’에 비친 네 이야기야. ${portrait} ${index === 2 ? person.longing : insight}`,
      `${person.cost} ${actions.join(' ')}`
    ], cardSummary(card, portrait, index === 2 ? actions.join(' ') : insight));
  });
  const connected = buildCardConnections({ cards, context, names });
  const connection = piece('personal-connection', '이 고민에 담긴 너의 마음',
    connected.paragraphs, connected.summaryLines);
  const solution = getConnectionProfile(cards[2].id);
  const support = directInterpretation(solution.support);
  const tension = directInterpretation(solution.tension);
  const comparison = {
    title: context.comparison.title,
    basis: `‘${names[2]}’ 카드가 짚는 해결 방법이야. ${support} ${tension}`,
    basisSummaryLines: cardSummary(cards[2], support, tension),
    options: ['a', 'b'].map(key => {
      const option = context.comparison[key];
      // These are practical tradeoffs, not claims made by the drawn card.
      const gain = option.gain;
      const burden = option.burden;
      const prepare = directAction(option.prepare);
      return { id: `personal-choice-${key}`, key, ...option, gain, burden, prepare,
        summaryLines: summaryLinesFrom(gain, burden, [prepare]) };
    })
  };
  const followUps = context.followUps.map((item, index) => {
    const paragraphs = [item.paragraphs[0], directAction(item.paragraphs[1])];
    return piece(`personal-question-${item.id}`, item.question, [
      ...paragraphs,
      `‘${names[index]}’ 카드가 묻는 질문이야. ${getConnectionProfile(cards[index].id).question}`
    ], summaryLinesFrom(paragraphs[0], paragraphs[1]));
  });
  return {
    contextId, topicId, label: context.label, question: context.question,
    example: context.example, cards: cards.map(card => card.id), names,
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
  lines.push(report.basis, '');
  return lines;
}
