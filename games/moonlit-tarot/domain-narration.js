import { CARD_INTERPRETATIONS } from './interpretation-engine.js?v=20261120-tarot-voice2';
import { CASE_GUIDES, getCaseGuide } from './case-guides.js?v=20261120-tarot-voice2';
import { LIFE_TOPICS } from './topic-catalog-life.js?v=20261114-tarot-first-person1';
import { RELATIONSHIP_TOPICS } from './topic-catalog-relations.js?v=20261114-tarot-first-person1';
import { PRACTICAL_TOPICS } from './topic-catalog-practical.js?v=20261114-tarot-first-person1';
import { WELLBEING_TOPICS } from './topic-catalog-wellbeing.js?v=20261114-tarot-first-person1';
import { summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261120-tarot-voice2';

// Fifty editorial lenses on the same three cards, not extra draws or predictions.
// Every card/topic pair has an authored application and action. The selected
// card is never reduced to a shared action bucket or a context-substitution rule.
export const READING_TOPICS = Object.freeze([
  ...LIFE_TOPICS, ...RELATIONSHIP_TOPICS, ...PRACTICAL_TOPICS, ...WELLBEING_TOPICS
]);

export const READING_CATEGORIES = Object.freeze([
  { id: 'self', label: '나 자신과 삶의 방향', count: 5 },
  { id: 'timeline', label: '과거·현재·미래의 흐름', count: 5 },
  { id: 'solutions', label: '지금의 문제와 해결', count: 5 },
  { id: 'love', label: '연애·인연·궁합', count: 7 },
  { id: 'family', label: '가족과 인간관계', count: 4 },
  { id: 'career', label: '직업·직장·사업', count: 5 },
  { id: 'study', label: '학업과 배움', count: 5 },
  { id: 'money', label: '금전·문서·계약', count: 5 },
  { id: 'wellbeing', label: '건강과 생활 돌봄', count: 4 },
  { id: 'opportunities', label: '행운·도움·주의할 흐름', count: 5 }
]);

export const DOMAIN_READING_BASIS = '같은 세 장을 여러 생활 주제로 풀어 썼어요. 카드의 기본 뜻과 전통 자료를 함께 참고하고, 이해를 돕는 가상 예시와 실천 방법을 담았어요. 실제로 겪은 일이나 미래의 사건, 상대의 속마음을 알아낸 내용은 아니에요.';

/** Independent of the initially selected topic: each domain has its own prose. */
export function buildDomainGroup({ cards, readings } = {}) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || cards.some(card => !card?.id || !card.name || !Object.hasOwn(CARD_INTERPRETATIONS, card.id))
      || !Array.isArray(readings) || readings.length !== 3
      || readings.some(reading => !reading?.meaning)) {
    throw new Error('tarot_domains_require_three_actual_cards');
  }
  const sections = READING_TOPICS.map(topic => {
    const situation = CASE_GUIDES[topic.id];
    const guides = cards.map(card => getCaseGuide(topic.id, card.id));
    const interpretation = {
      cause: `${guides[0].insight} ${directAction(situation.prompt)}`,
      scene: `${guides[1].insight} ${guides[1].action}`,
      response: `${guides[2].insight} ${guides[2].action}`,
      outcome: directAction(situation.check)
    };
    const summaryLines = summaryLinesFrom(guides[0].insight, guides[2].action,
      [guides[2].insight, guides[1].insight, guides[1].action]);
    return {
      id: topic.id,
      number: topic.number,
      categoryId: topic.category,
      title: topic.title,
      subtitle: topic.subtitle,
      example: directInterpretation(situation.example),
      interpretation,
      guideIds: guides.map(guide => guide.id),
      summaryLines,
      paragraphs: [
        // Keep an insight and its action together: "that action" and "those
        // words" must still have their actual antecedent when moved first.
        interpretation.response,
        interpretation.cause,
        interpretation.scene,
        `${directInterpretation(situation.example)} ${interpretation.outcome}`
      ]
    };
  });
  return {
    id: 'domains',
    label: '분야별 풀이',
    description: '궁금한 분야를 고르면 핵심 풀이와 지금 할 일을 먼저 읽을 수 있어요.',
    categories: READING_CATEGORIES,
    sections
  };
}
