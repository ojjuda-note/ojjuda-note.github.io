import { getPersonalContext } from './personal-contexts.js?v=20261113-tarot-personal1';
import { buildCardConnections, getConnectionProfile } from './card-connections.js?v=20261113-tarot-direct1';
import { getReading } from './readings.js?v=20261113-tarot-direct1';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction, directCardAdvice } from './reading-voice.js?v=20261113-tarot-direct1';

export const PERSONAL_BASIS = '뽑은 세 장의 뜻을 고른 상황에 적용한 풀이예요. 카드 연결에는 공통 해석 규칙을 쓰며, 선택 비교와 이어지는 답변은 상황별 생활 제안이에요.';
const roles = ['지금의 문제', '현재 상황의 핵심', '해결을 위한 행동'];
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
    return piece(`personal-role-${index}`, roles[index], [`‘${names[index]}’ 카드의 핵심이야. ${advice}`],
      cardSummary(card, advice));
  });
  const connected = buildCardConnections({ cards, context, names });
  const pairSentences = splitSummarySentences(connected.paragraphs[0]).slice(2);
  const responseSentences = splitSummarySentences(connected.paragraphs[2]);
  const connectionSummary = summaryLinesFrom(
    connected.evidence.pair === 'different-emphasis' ? pairSentences.at(-1) : pairSentences[0],
    responseSentences[1], [...pairSentences, ...responseSentences]);
  connectionSummary[0] = `‘${cards[0].name}’ · ‘${cards[1].name}’: ${connectionSummary[0]}`;
  connectionSummary[1] = `‘${cards[2].name}’ 카드: ${connectionSummary[1]}`;
  const connection = piece('personal-connection', '세 장을 함께 읽으면',
    connected.paragraphs, connectionSummary);
  const solution = getConnectionProfile(cards[2].id);
  const support = directInterpretation(solution.support);
  const tension = directInterpretation(solution.tension);
  const comparison = {
    title: context.comparison.title,
    basis: `선택의 기준은 해결 자리에 놓인 ‘${names[2]}’ 카드야. ${support} ${tension}`,
    basisSummaryLines: cardSummary(cards[2], support, tension),
    options: ['a', 'b'].map(key => {
      const option = context.comparison[key];
      const gain = directInterpretation(option.gain);
      const burden = directInterpretation(option.burden);
      const prepare = directAction(option.prepare);
      return { id: `personal-choice-${key}`, key, ...option, gain, burden, prepare,
        summaryLines: summaryLinesFrom(gain, burden, [prepare]) };
    })
  };
  const followUps = context.followUps.map((item, index) => {
    const paragraphs = [directInterpretation(item.paragraphs[0]), directAction(item.paragraphs[1])];
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
  for (const section of [...report.primary, report.connection]) {
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
