import { CARD_LIFE_THEMES } from './life-themes.js?v=20261114-tarot-card-intro1';
import { buildDomainGroup, DOMAIN_READING_BASIS } from './domain-narration.js?v=20261114-tarot-card-intro1';
import { getCardInterpretation, interpretCard, MAIN_CONTEXTS } from './interpretation-engine.js?v=20261114-tarot-review2';
import { getPersonStory } from './person-stories.js?v=20261114-tarot-card-intro1';
import { buildPersonNarrative, PERSONAL_READING_BASIS } from './person-narrative.js?v=20261114-tarot-card-intro1';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261113-tarot-easy1';

// Card meanings, concrete circumstances and the relationship between the
// actual cards are kept distinct. The historical source remains available.
const TOPIC_NAMES = Object.freeze({
  overall: '전체 운세', love: '연애와 관계', money: '돈과 생활', work: '일과 도전'
});
// These questions add a different reflection to each view. Detailed card
// examples remain in the individual reading instead of being copied here.
const REPORT_QUESTIONS = Object.freeze({
  overall: {
    obstacle: '일정이 어긋나면 꼭 지킬 약속과 다른 날로 옮길 일을 나눠. 하루 계획을 못 지켰다고 남은 일까지 포기할 필요는 없어.'
  },
  love: {
    obstacle: '연락 간격이나 약속이 달라졌다면 이유를 직접 물어봐. 서로 원하는 관계가 다르다면 계속 설득하려 하지 마. 그 차이를 받아들이고 관계를 이어 갈지 결정해.'
  },
  money: {
    obstacle: '갑자기 돈이 필요해지면 언제까지 얼마를 내야 하는지 확인해. 새로 결제하기 전에 취소하거나 금액을 줄일 수 있는 지출부터 찾아봐. 확인이 필요하면 담당자에게 직접 물어봐.'
  },
  work: {
    obstacle: '새 요청이 들어오면 이미 맡은 일과 마감을 함께 알려 줘. 무엇을 먼저 끝낼지 확인하고 필요한 시간을 분명히 말해.'
  }
});
// Complete sentences avoid joining several long context phrases into one claim.
const REPORT_PRACTICE = Object.freeze({
  overall: {
    achievement: '지난 일주일에 끝낸 일을 살펴봐. 큰 결과만 찾을 필요는 없어. 전에는 못 했던 선택을 했거나 다음에도 쓸 방법을 익혔다면 그것도 성취야.'
  },
  love: {
    achievement: '서로 나눈 말과 지킨 약속을 떠올려 봐. 마음을 솔직히 말했거나 불편한 부탁을 거절한 경험도 돌아볼 만한 성취야.'
  },
  money: {
    achievement: '최근 결제 내역과 매달 나가는 돈을 살펴봐. 필요 없는 결제를 줄였거나 사고 싶은 물건을 미룬 경험이 있는지 찾아봐. 꼭 큰돈을 모아야만 성취인 건 아니야.'
  },
  work: {
    achievement: '요청받은 일과 실제로 끝낸 일을 비교해 봐. 결과가 완벽하지 않아도 새로 익힌 방법이 있는지 살펴봐. 다음 작업에 다시 쓸 수 있는 경험도 성취야.'
  }
});
const SUITS = Object.freeze({
  wands: { name: '완드', plain: '지팡이', object: '지팡이를' },
  cups: { name: '컵', plain: '잔', object: '잔을' },
  swords: { name: '소드', plain: '검', object: '검을' },
  pentacles: { name: '펜타클', plain: '동전', object: '동전을' }
});
const RANKS = Object.freeze({ page: '시종', knight: '기사', queen: '여왕', king: '왕' });
const NUMBERS = Object.freeze({ ace: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' });

function hasFinalConsonant(text) {
  const last = String(text).trim().slice(-1);
  if (/\d/.test(last)) return '013678'.includes(last);
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}
function clean(text) { return String(text ?? '').trim(); }
function unique(parts) {
  const seen = new Set();
  return parts.map(clean).filter(text => {
    const key = text.replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function checkReadingInput({ card, topicId, index, position, foundation, guidance, detail }) {
  if (!card?.id || !card.name || !Object.hasOwn(TOPIC_NAMES, topicId)
      || !Number.isInteger(index) || index < 0 || index > 2 || !position?.label
      || !foundation?.symbol || !foundation.takeaway || !foundation.caution
      || !guidance?.meaning || !guidance.positions?.[index]
      || !CARD_LIFE_THEMES[card.id] || ['strength', 'past', 'achievement', 'change'].some(key => !CARD_LIFE_THEMES[card.id][key])
      || !card.topics?.[topicId] || !detail?.example || !detail.action) {
    throw new Error('tarot_narration_requires_authored_card_meanings');
  }
}
function naming(card) {
  const suit = SUITS[card.suit];
  if (!suit) return { displayName: card.name, explanation: '' };
  const rank = RANKS[card.rank];
  const displayName = rank ? `${suit.object} 든 ${rank}`
    : NUMBERS[card.rank] ? `${suit.plain} ${NUMBERS[card.rank]}`
      : card.name.replace(suit.name, suit.plain);
  const rankNote = card.rank === 'ace' ? '에이스는 그 무늬의 첫 카드를 부르는 이름이야.'
    : card.rank === 'page' ? '시종은 곁에서 돕는 사람을 가리키는 이름이야.' : '';
  const explanation = unique([
    displayName === card.name ? '' : `원래 이름은 ‘${card.name}’${hasFinalConsonant(card.name) ? '이야' : '야'}.`,
    suit.name === suit.plain ? '' : `${suit.name}${hasFinalConsonant(suit.name) ? '은' : '는'} ${suit.plain}${hasFinalConsonant(suit.plain) ? '을' : '를'} 뜻해.`,
    rankNote
  ]).join(' ');
  return { displayName, explanation };
}
function fullName(card, reading) {
  const display = reading.displayName || naming(card).displayName;
  return display === card.name ? display : `${display}(${card.name})`;
}

// The original position passage remains in the card introduction. These
// explicit editorial changes only address its reference to a reading position;
// the person's circumstances, conditions and actions stay complete.
function personalPosition(text) {
  const replacements = [
    ['지금 네 안에는 해 보고 싶은 마음과 망설임이 함께 있다는 뜻이야.', '지금 네 안에서는 해 보고 싶은 마음과 망설임이 함께 움직여.'],
    ['지금 네 마음에는 혼자 다 해내기보다 함께 잘하고 싶은 바람이 있다는 뜻이야.', '지금 네 마음은 혼자 다 해내기보다 함께 잘하는 쪽으로 향해.'],
    ['이 자리는 막연히 끝을 예고하기보다 지금 확인된 마무리가 생활의 무엇을 바꾸는지 짚어 줘.', '막연히 끝을 걱정하기보다, 지금 확인된 마무리가 네 생활에서 무엇을 바꾸는지 살펴보렴.'],
    ['이 자리는 빠른 결과보다 지금 이용할 수 있는 도움과 다시 이어 갈 여유에 주목해.', '빠른 결과만 바라기보다 지금 이용할 수 있는 도움과 다시 이어 갈 여유를 살펴보렴.'],
    ['이 자리는 지난 일에 대한 평가가 실제로 무엇을 바꾸는지, 네가 답하고 책임질 부분은 무엇인지 짚어 줘.', '지난 일에 대한 평가가 실제로 무엇을 바꾸는지, 네가 답하고 책임질 부분은 무엇인지 살펴보렴.'],
    ['이 자리는 결과가 이미 정해진 상태보다 관심을 실제 경험으로 옮길 여건에 주목해.', '결과를 미리 정하기보다 관심을 실제 경험으로 옮길 여건부터 살펴보렴.'],
    ['이 자리의 핵심이란다.', '지금 살펴볼 핵심이란다.'],
    ['이 자리의 핵심이야.', '지금 살펴볼 핵심이야.'],
    ['이 자리의 중심이야.', '지금 중요한 부분이야.'],
    ['여유가 필요한 자리야.', '여유가 필요해.'],
    ['중요한 자리야.', '지금 중요해.'],
    ['알아보는 자리야.', '알아보렴.'],
    ['받아들이는 자리야.', '받아들여 보렴.'],
    ['확인하는 자리야.', '확인해 보렴.'],
    ['구분하는 자리야.', '구분해 보렴.'],
    ['비교하는 자리야.', '비교해 보렴.'],
    ['드러내는 자리야.', '드러내 보렴.'],
    ['살피는 자리야.', '살펴보렴.'],
    ['짚는 자리야.', '짚어 보렴.'],
    ['보는 자리야.', '살펴보렴.']
  ];
  return replacements.reduce((value, [original, personal]) => value.replaceAll(original, personal), text);
}

/** Explain the actual card directly, without seven repeated introductions. */
export function narrateReading({ card, topicId, index, position, foundation, guidance, detail, base }) {
  checkReadingInput({ card, topicId, index, position, foundation, guidance, detail });
  const { displayName, explanation } = naming(card);
  const rule = getCardInterpretation(card.id);
  const person = getPersonStory(card.id);
  const introduction = `${['첫 번째', '두 번째', '세 번째'][index]} 카드는 ‘${displayName}’${hasFinalConsonant(displayName) ? '이야' : '야'}. ‘${position.label}’에 관한 풀이를 들려줄게. ${explanation}`.trim();
  const meaning = rule.meaning;
  const positionMeaning = directInterpretation(clean(guidance.positions[index]));
  const lifeTheme = Object.fromEntries(Object.entries(CARD_LIFE_THEMES[card.id]).map(([key, text]) =>
    [key, directInterpretation(text)]));
  const topicMeaning = directInterpretation(clean(card.topics[topicId]));
  const example = clean(detail.example);
  const action = directAction(clean(detail.action));
  const guidanceCaution = directInterpretation(clean(guidance.caution));
  const caution = unique([foundation.caution, guidanceCaution]).join(' ');
  const appliedMeaning = `${person[topicId]} ${index === 2 ? action : positionMeaning}`;
  const paragraphs = [
    `${meaning} ${clean(foundation.symbol)}`,
    person[topicId],
    person.portrait,
    topicMeaning,
    positionMeaning,
    example,
    clean(foundation.caution)
  ];
  return {
    ...base,
    originalName: card.name,
    displayName,
    introduction,
    paragraphs,
    detailSections: base.sections,
    summary: splitSummarySentences(person[topicId])[0],
    text: [introduction, ...paragraphs].join('\n\n'),
    meaning,
    traditionalMeaning: clean(guidance.meaning),
    foundationTakeaway: clean(foundation.takeaway),
    symbol: clean(foundation.symbol),
    positionMeaning,
    personalPositionMeaning: personalPosition(positionMeaning),
    appliedMeaning,
    positionLabel: position.label,
    roleIndex: index,
    topicMeaning,
    example,
    action,
    caution,
    foundationCaution: clean(foundation.caution),
    guidanceCaution,
    personalCaution: directInterpretation(base.personalCaution || guidanceCaution),
    lifeTheme,
    personStory: person,
    theme: clean(foundation.theme)
  };
}

function section(id, title, paragraphs, summaryLines) {
  return { id, title, paragraphs: unique(paragraphs), summaryLines };
}
function cardIntroduction(card, reading, index) {
  return {
    ...section(`card-intro-${index}`, `${['첫 번째', '두 번째', '세 번째'][index]} 카드 · ${fullName(card, reading)}`,
      [reading.introduction, ...reading.paragraphs], summaryLinesFrom(reading.meaning, reading.positionMeaning)),
    cardId: card.id,
    roleIndex: index,
    displayName: reading.displayName,
    originalName: card.name,
    nameGuide: reading.nameGuide || '',
    detailSections: reading.detailSections || [],
    reference: reading.reference,
    sourceNote: reading.sourceNote || null
  };
}

/** Each view adds a different part of the reading instead of repeating examples. */
export function narrateSummary({ cards, topicId, readings, innerMeaning, flowMeaning, direction, base }) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || !Array.isArray(readings) || readings.length !== 3 || !Object.hasOwn(TOPIC_NAMES, topicId)
      || cards.some(card => !card?.id || !card.name) || readings.some(reading => !reading?.meaning || !reading.positionMeaning || !reading.topicMeaning || !reading.action || !reading.example || !reading.theme
        || !reading.foundationCaution || !reading.guidanceCaution || !reading.lifeTheme)
      || !innerMeaning || !flowMeaning || !direction) {
    throw new Error('tarot_narration_requires_three_ordered_readings');
  }
  const names = cards.map((card, index) => fullName(card, readings[index]));
  const [problem, situation, solution] = readings;
  const questions = REPORT_QUESTIONS[topicId];
  const practice = REPORT_PRACTICE[topicId];
  const story = buildPersonNarrative({ cards, topicId, names, closingAction: solution.action });
  const [firstPerson, currentPerson, nextPerson] = story.stories;
  const context = MAIN_CONTEXTS[topicId];
  const outcome = interpretCard(cards[2].id, 'outcome', context);
  const cautions = readings.map(reading => reading.personalCaution || reading.guidanceCaution);
  const positionMeanings = readings.map(reading => reading.personalPositionMeaning || personalPosition(reading.positionMeaning));
  const ritual = solution.action;
  const problemSections = [
    section('together', '지금 너에게 이어지는 이야기', story.paragraphs,
      summaryLinesFrom(story.pairReading, story.choiceLink)),
    section('problem-now', '지금 고민의 핵심', [
      firstPerson[topicId],
      positionMeanings[0]
    ], summaryLinesFrom(firstPerson[topicId], positionMeanings[0])),
    section('situation-now', '지금 상황과 속마음', [
      currentPerson[topicId],
      positionMeanings[1]
    ], summaryLinesFrom(currentPerson[topicId], positionMeanings[1])),
    section('solution', '지금 선택할 해결 방법', [
      nextPerson[topicId],
      solution.action
    ], summaryLinesFrom(nextPerson[topicId], solution.action)),
    section('possible-outcome', '실천한 뒤 살펴볼 변화', [
      `앞에서 정한 일을 실천했다면 이 점을 확인하렴. ${outcome}`,
      `이어 갈 때 도움이 되는 힘도 기억해 둬. ${solution.lifeTheme.strength}`
    ], summaryLinesFrom(outcome, solution.lifeTheme.strength))
  ];
  const strengthsSummary = summaryLinesFrom(firstPerson.portrait, nextPerson.portrait, [currentPerson.portrait]);
  const timelineSections = [
    section('strengths', '나의 성향과 강점', [
      firstPerson.portrait,
      currentPerson.portrait,
      nextPerson.portrait
    ], strengthsSummary),
    section('past-flow', '과거의 흐름', [
      problem.lifeTheme.past,
      `그 경험에서 다시 살릴 수 있는 힘도 있어. ${problem.lifeTheme.strength}`
    ], summaryLinesFrom(problem.lifeTheme.past, problem.lifeTheme.past)),
    section('past-hardships', '반복해서 힘들어지는 이유', [
      cautions[0],
      `비슷한 일로 다시 힘들 때는 이렇게 해 봐. ${problem.action}`
    ], summaryLinesFrom(cautions[0], problem.action)),
    section('past-achievements', '내가 해낸 일', [
      problem.lifeTheme.achievement,
      practice.achievement
    ], summaryLinesFrom(problem.lifeTheme.achievement, problem.lifeTheme.achievement)),
    section('present-luck', '지금 드러나는 나의 모습', [
      `${situation.lifeTheme.strength} ${cautions[1]}`,
      `지금 실천할 일도 짚어 줄게. ${situation.action}`
    ], summaryLinesFrom(situation.lifeTheme.strength, situation.action)),
    section('future-change', '앞으로의 변화', [
      solution.lifeTheme.change
    ], summaryLinesFrom(solution.lifeTheme.change, solution.lifeTheme.change)),
    section('future-hardships', '앞으로 조심할 일과 대처', [
      cautions[2],
      questions.obstacle
    ], summaryLinesFrom(cautions[2], questions.obstacle))
  ];
  const groups = [
    {
      id: 'cards', label: '카드 소개',
      description: '이번에 펼친 세 장의 이름과 그림, 전통적인 뜻을 살펴보자.',
      sections: cards.map((card, index) => cardIntroduction(card, readings[index], index)),
      detailSections: base.sections || [],
      basisParagraphs: [DOMAIN_READING_BASIS, PERSONAL_READING_BASIS, '타로의 전통 해석이에요. 미래를 확정하지 않아요.']
    },
    { id: 'problem', label: '나의 이야기', sections: problemSections },
    { id: 'timeline', label: '과거·현재·미래', sections: timelineSections },
    buildDomainGroup({ cards, readings })
  ];
  const synthesis = story.paragraphs.join('\n\n');
  const paragraphs = ['problem-now', 'situation-now', 'solution'].map(id =>
    problemSections.find(item => item.id === id).paragraphs.join('\n\n'));
  const oneLine = story.overview;
  const detailSections = [
    { title: '함께 참고할 이야기', subtitle: base.oneLine, body: base.summary },
    { title: '생활에서 실천할 일', subtitle: '', body: base.ritual }
  ];
  const text = [...groups.map(group => {
    const parts = [group.label];
    if (group.description) parts.push(group.description);
    let previousCategory;
    for (const item of group.sections) {
      if (item.categoryId && item.categoryId !== previousCategory) {
        const category = group.categories?.find(category => category.id === item.categoryId);
        if (category) parts.push(category.label);
        previousCategory = item.categoryId;
      }
      parts.push([item.title, item.subtitle, ...item.paragraphs].filter(Boolean).join('\n\n'));
      if (item.nameGuide) parts.push('이름에 담긴 뜻', item.nameGuide);
      if (item.detailSections?.length) parts.push('카드의 자세한 뜻', ...item.detailSections.map(detail =>
        [detail.title, detail.subtitle, detail.body].filter(Boolean).join('\n\n')));
      if (item.sourceNote) parts.push('옛 해석과 이곳의 풀이', item.sourceNote.body,
        item.sourceNote.reference.label, item.sourceNote.reference.url);
      if (item.reference) parts.push('참고한 자료', item.reference.label, item.reference.url);
    }
    if (group.detailSections?.length) parts.push('세 장을 함께 살펴보기', ...group.detailSections.map(item =>
      [item.title, item.subtitle, item.body].filter(Boolean).join('\n\n')));
    if (group.basisParagraphs?.length) parts.push('풀이 방식', ...group.basisParagraphs);
    if (group.id === 'problem') {
      parts.push('함께 읽는 종합 해석', ...detailSections.map(item =>
        [item.title, item.subtitle, item.body].filter(Boolean).join('\n\n')));
    }
    return parts.join('\n\n');
  })].join('\n\n');
  return {
    ...base,
    headline: '지금 너에게 이어지는 이야기',
    groups,
    sections: groups.flatMap(group => group.sections),
    paragraphs,
    synthesis,
    summary: synthesis,
    oneLine,
    ritual,
    ritualInReading: true,
    detailSections,
    text
  };
}
