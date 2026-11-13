import { CARD_INTERPRETATIONS } from './interpretation-engine.js?v=20261113-tarot-variety1';
import { CASE_GUIDES, getCaseGuide } from './case-guides.js?v=20261113-tarot-personal1';
import { LIFE_TOPICS } from './topic-catalog-life.js?v=20261113-tarot-context1';
import { RELATIONSHIP_TOPICS } from './topic-catalog-relations.js?v=20261113-tarot-context1';
import { PRACTICAL_TOPICS } from './topic-catalog-practical.js?v=20261113-tarot-context1';
import { WELLBEING_TOPICS } from './topic-catalog-wellbeing.js?v=20261113-tarot-context1';

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

function fullName(card, reading) {
  const displayName = reading.displayName || card.name;
  return displayName === card.name ? card.name : `${displayName}(${card.name})`;
}

/** Independent of the initially selected topic: each domain has its own prose. */
export function buildDomainGroup({ cards, readings } = {}) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || cards.some(card => !card?.id || !card.name || !Object.hasOwn(CARD_INTERPRETATIONS, card.id))
      || !Array.isArray(readings) || readings.length !== 3
      || readings.some(reading => !reading?.meaning)) {
    throw new Error('tarot_domains_require_three_actual_cards');
  }
  const names = cards.map((card, index) => fullName(card, readings[index]));
  const sections = READING_TOPICS.map(topic => {
    const situation = CASE_GUIDES[topic.id];
    const guides = cards.map(card => getCaseGuide(topic.id, card.id));
    const interpretation = {
      cause: `${guides[0].insight} ${situation.prompt}`,
      scene: `${guides[1].insight} ${guides[1].action}`,
      response: `${guides[2].insight} ${guides[2].action}`,
      outcome: situation.check
    };
    return {
      id: topic.id,
      number: topic.number,
      categoryId: topic.category,
      title: topic.title,
      subtitle: topic.subtitle,
      example: situation.example,
      interpretation,
      guideIds: guides.map(guide => guide.id),
      paragraphs: [
        situation.example,
        `‘${names[0]}’ 카드로 읽는 핵심: ${interpretation.cause}`,
        `‘${names[1]}’ 카드가 비추는 상황: ${interpretation.scene}`,
        `‘${names[2]}’의 대처와 흐름: ${interpretation.response} ${interpretation.outcome}`
      ]
    };
  });
  return {
    id: 'domains',
    label: '분야별 풀이',
    description: '같은 세 장의 뜻을 각 주제에 적용한 해석과 생활 제안이에요. 카드와 주제별로 해설을 작성했으며, 카드의 기본 뜻과 전통 자료는 여러 풀이에서 함께 참고해요. 사례는 이해를 돕는 가상 장면이며 실제 과거나 미래·상대의 생각을 확인한 내용은 아니에요.',
    categories: READING_CATEGORIES,
    sections
  };
}
