import { CARD_PATTERNS } from './spread-patterns.js?v=20261113-tarot-corpus1';
import { LIFE_TOPICS } from './topic-catalog-life.js?v=20261113-tarot-topics50-1';
import { RELATIONSHIP_TOPICS } from './topic-catalog-relations.js?v=20261113-tarot-topics50-1';
import { PRACTICAL_TOPICS } from './topic-catalog-practical.js?v=20261113-tarot-topics50-1';
import { WELLBEING_TOPICS } from './topic-catalog-wellbeing.js?v=20261113-tarot-topics50-1';

// Fifty editorial lenses on the same three cards, not extra draws or predictions.
// Actions follow the existing third-card response classes: try, clarify, boundary,
// support, rest, release, practise, appreciate. Each topic supplies its own examples.
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
      || cards.some(card => !card?.id || !card.name || !Object.hasOwn(CARD_PATTERNS, card.id))
      || !Array.isArray(readings) || readings.length !== 3
      || readings.some(reading => !reading?.meaning)) {
    throw new Error('tarot_domains_require_three_actual_cards');
  }
  const names = cards.map((card, index) => fullName(card, readings[index]));
  const advice = Number(CARD_PATTERNS[cards[2].id][2]);
  const [problem, situation, solution] = readings;
  const sections = READING_TOPICS.map(topic => ({
    id: topic.id,
    number: topic.number,
    categoryId: topic.category,
    title: topic.title,
    subtitle: topic.subtitle,
    paragraphs: [
      `첫 번째 카드 ‘${names[0]}’부터 살펴볼게. ${problem.meaning} ${topic.focus}`,
      `두 번째 카드 ‘${names[1]}’로 지금의 상황을 돌아보자. ${situation.meaning} ${topic.example}`,
      `세 번째 카드 ‘${names[2]}’는 해 볼 선택과 그다음 흐름을 살피는 자리야. ${solution.meaning} ${topic.actions[advice]}`
    ]
  }));
  return {
    id: 'domains',
    label: '분야별 풀이',
    description: '같은 세 장의 전통적인 카드 뜻을 각 주제에 연결한 풀이예요. 생활 속 예시와 실천 방법은 이해를 돕는 공통 설명이며, 실제 과거나 미래·상대의 생각을 확인한 내용은 아니에요.',
    categories: READING_CATEGORIES,
    sections
  };
}
