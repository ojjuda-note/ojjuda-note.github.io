import { MAJOR_RULES } from './card-rules-major.js?v=20261113-tarot-easy1';
import { WANDS_RULES } from './card-rules-wands.js?v=20261113-tarot-easy1';
import { CUPS_RULES } from './card-rules-cups.js?v=20261113-tarot-easy1';
import { SWORDS_RULES } from './card-rules-swords.js?v=20261113-tarot-easy1';
import { PENTACLES_RULES } from './card-rules-pentacles.js?v=20261113-tarot-easy1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261113-tarot-easy1';

// Card-specific editorial applications of the existing, cited card meanings.
// The same rules are applied to concrete topic contexts; these are not extra
// independently authored predictions. No randomness is used for presentation.
export const CARD_INTERPRETATIONS = Object.freeze({
  ...MAJOR_RULES, ...WANDS_RULES, ...CUPS_RULES, ...SWORDS_RULES, ...PENTACLES_RULES
});
export const CONTEXT_FIELDS = Object.freeze([
  'focus', 'scene', 'aim', 'known', 'unknown', 'resource', 'burden',
  'boundary', 'habit', 'small', 'sign'
]);

export const MAIN_CONTEXTS = Object.freeze({
  overall: {
    focus: '해야 할 일과 쉬는 시간',
    scene: '할 일이 겹쳐 무엇부터 해야 할지 모를 때',
    aim: '일과 휴식의 균형',
    known: '지난주 일정과 끝낸 일',
    unknown: '꼭 할 일과 미뤄도 될 일',
    resource: '익숙한 방법과 도와줄 사람',
    burden: '혼자 맡은 일과 모자란 휴식',
    boundary: '하루에 맡을 일과 쉬는 시간',
    habit: '급할수록 여러 일을 벌이는 습관',
    small: '오늘 꼭 할 일 하나를 골라 끝내기',
    sign: '밀린 일이 줄고 쉴 시간이 생겼는지'
  },
  love: {
    focus: '연락과 만남',
    scene: '나는 자주 연락하고 싶은데 상대의 생각은 모를 때',
    aim: '서로 편한 관계',
    known: '직접 나눈 말과 지킨 약속',
    unknown: '서로 편한 연락 간격과 만남 횟수',
    resource: '편했던 대화와 공통 관심사',
    burden: '한 사람만 연락하고 약속을 잡는 수고',
    boundary: '서로 동의한 만남 횟수와 혼자 쉴 시간',
    habit: '답이 늦으면 상대의 마음을 혼자 짐작하는 습관',
    small: '원하는 연락 방식을 말하고 상대의 생각 듣기',
    sign: '재촉하지 않아도 대화와 약속이 이어지는지'
  },
  money: {
    focus: '지출과 저축',
    scene: '사고 싶은 물건이 있지만 이번 달 생활비도 남겨야 할 때',
    aim: '생활비를 남기는 계획',
    known: '최근 쓴 돈과 매달 나가는 돈',
    unknown: '추가 비용과 취소 조건',
    resource: '이미 가진 물건과 이용 중인 서비스',
    burden: '반복 결제와 한꺼번에 몰린 지출',
    boundary: '생활비를 빼고 쓸 수 있는 금액',
    habit: '쓸 곳을 생각하기 전에 할인에 끌려 결제하는 습관',
    small: '이번 달 결제 내역에서 계속 나갈 돈 찾기',
    sign: '겹치는 지출이 줄고 생활비가 남았는지'
  },
  work: {
    focus: '맡은 일과 앞으로 할 일',
    scene: '마감이 다가오는데 준비와 회의만 길어질 때',
    aim: '맡은 일의 완성',
    known: '요청받은 내용과 마감, 끝낸 작업',
    unknown: '결정할 사람과 각자가 맡을 일',
    resource: '익숙한 도구와 동료의 강점',
    burden: '담당자 없이 늘어나는 요청과 마감',
    boundary: '내가 맡을 일과 가능한 시간',
    habit: '준비와 부탁에 매달려 실제 작업을 미루는 습관',
    small: '확인받을 부분을 담은 초안 하나 만들기',
    sign: '담당자가 정해지고 작업이 끝까지 진행됐는지'
  }
});

function ending(text) {
  const last = String(text).trim().replace(/[’'”"\])]+$/g, '').slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  if (/\d/.test(last)) return '178'.includes(last) ? 8 : '036'.includes(last) ? 1 : 0;
  return 0;
}

export function withParticle(value, form) {
  const tail = ending(value);
  const pairs = { '을': ['을', '를'], '를': ['을', '를'], '은': ['은', '는'], '는': ['은', '는'],
    '이': ['이', '가'], '가': ['이', '가'], '과': ['과', '와'], '와': ['과', '와'] };
  if (form === '으로' || form === '로') return `${value}${tail && tail !== 8 ? '으로' : '로'}`;
  if (!pairs[form]) throw new Error(`tarot_context_unknown_particle:${form}`);
  return value + pairs[form][tail ? 0 : 1];
}

export function getCardInterpretation(cardId) {
  const rule = Object.hasOwn(CARD_INTERPRETATIONS, cardId) ? CARD_INTERPRETATIONS[cardId] : undefined;
  if (!rule) throw new Error('tarot_context_unknown_card');
  return rule;
}

export function interpretCard(cardId, part, context) {
  const rule = getCardInterpretation(cardId);
  if (!['problem', 'scene', 'response', 'outcome'].includes(part)
      || !CONTEXT_FIELDS.every(key => typeof context?.[key] === 'string' && context[key].trim())) {
    throw new Error('tarot_context_requires_complete_scene');
  }
  const text = rule[part].replace(/\{([a-z]+)(?::([^{}:]+))?\}/g, (_, key, particle) => {
    if (!CONTEXT_FIELDS.includes(key)) throw new Error(`tarot_context_unknown_field:${key}`);
    return particle ? withParticle(context[key], particle) : context[key];
  });
  if (/[{}]/.test(text)) throw new Error('tarot_context_unresolved_template');
  // Examples remain explicitly hypothetical; only authored interpretation and
  // advice use the reviewed voice rules. The source card rules stay unchanged.
  if (part === 'scene') return text;
  return part === 'response' ? directAction(text) : directInterpretation(text);
}

// The relationship of two actual cards matters as well as their individual
// meanings. This bridge is used once in the synthesis, not in all 50 topics.
export function connectCards({ left, right, leftName, rightName, leftTheme, rightTheme, context, phase = 'act' }) {
  const a = getCardInterpretation(left.id).motion;
  const b = getCardInterpretation(right.id).motion;
  const bridge = `‘${leftName}’에서는 ${withParticle(`‘${leftTheme}’`, '을')} 보여 줘. 이어 나온 ‘${rightName}’에서는 ${withParticle(`‘${rightTheme}’`, '을')} 강조해.`;
  if (phase === 'understand') {
    const situation = {
      advance: '하고 싶은 마음이 앞서 일을 서두르는지 살펴봐. 새로 벌인 일보다 끝까지 해낸 일이 얼마나 되는지 보는 거야.',
      review: '처음 내린 판단을 다시 살펴보라는 뜻이야. 직접 확인한 사실과 혼자 예상한 내용을 따로 적어 봐.',
      care: '계속할 힘과 쉴 시간이 필요하다는 뜻이야. 일이 진행되고 있어도 혼자 감당하기 벅차다면 도움을 요청해.',
      boundary: '원하는 일과 실제로 감당할 일이 맞는지 살펴봐. 벅차다면 양을 줄이거나 맡은 일을 나눠.',
      pause: '왜 멈춰 있는지부터 알아보라는 뜻이야. 지쳤다면 쉬고, 정보가 부족하다면 알아볼 질문을 정해.',
      release: '목표는 남기고 맞지 않는 방법을 바꾸라는 뜻이야. 계속 이루고 싶은 일과 그만둘 행동을 따로 적어.',
      connect: '혼자 결정할 일과 함께 정할 일을 나눠. 다른 사람의 시간이나 동의가 필요한 일은 직접 물어봐.',
      complete: '이미 끝낸 일부터 인정하라는 뜻이야. 해낸 일과 거기서 배운 점을 적고, 남은 일만 따로 정리해.'
    };
    return `${bridge} ${situation[b]}`;
  }
  let connection;
  if (a === b) {
    const same = {
      advance: `두 카드 모두 직접 해 보라고 말해. 시작하기 전에 ${withParticle(context.boundary, '을')} 정해 두면 무리할 때 멈출 수 있어.`,
      review: `두 카드 모두 사실 확인을 강조해. ${withParticle(context.unknown, '을')} 질문으로 적고, 답을 아는 사람이나 자료에서 하나씩 확인해.`,
      care: `두 카드 모두 돌봄을 강조해. ${withParticle(context.burden, '이')} 한쪽에 몰렸다면 할 일을 나누고 쉴 시간을 잡아.`,
      boundary: `두 카드 모두 꼭 지킬 것을 먼저 정하라는 뜻이야. ${withParticle(context.boundary, '을')} 지키되, 사정이 달라지면 기준도 다시 정해.`,
      pause: `지금은 더 밀어붙이기보다 부담을 덜어야 해. ${context.burden} 중 줄일 수 있는 것부터 고르고, 언제 다시 살펴볼지 정해.`,
      release: `두 카드 모두 되풀이하던 행동을 멈추라고 말해. ${withParticle(context.habit, '을')} 바꾸되, ${withParticle(context.aim, '은')} 계속 지켜도 돼.`,
      connect: `함께할 일과 각자 맡을 일을 분명하게 나눠. ${withParticle(context.resource, '을')} 어떻게 활용할지 이야기하고 역할을 정해.`,
      complete: `두 카드 모두 마무리를 강조해. ${withParticle(context.known, '을')} 돌아보며 다음에도 쓸 방법과 고칠 부분을 적어.`
    };
    // '에서' is a fixed suffix; it is intentionally outside the particle helper.
    connection = same[b];
  } else if (a === 'advance' && ['pause', 'review', 'boundary'].includes(b)) {
    connection = `하고 싶은 마음은 생겼지만 먼저 알아볼 것이 있어. ${withParticle(context.unknown, '을')} 확인한 뒤, 그 답에 맞춰 다음 행동을 정해.`;
  } else if (['pause', 'review'].includes(a) && b === 'advance') {
    connection = `생각한 내용을 작은 행동으로 확인할 차례야. ‘${context.small}’부터 해 보고, 실제로 어땠는지 살핀 뒤 계속할지 정해.`;
  } else if (a === 'release' && ['care', 'connect'].includes(b)) {
    connection = `그만둘 것을 정했다면 이제 도움받을 방법을 찾아. ${withParticle(context.burden, '을')} 혼자 버티지 말고, ${withParticle(context.resource, '을')} 활용해 부담을 나눠.`;
  } else {
    const next = {
      advance: `다음에는 작은 일 하나를 직접 해 봐. ‘${context.small}’부터 시작하고, 그 과정에서 ${withParticle(context.unknown, '을')} 확인해.`,
      review: `지금은 무엇을 알고 무엇을 모르는지 나눌 때야. ${withParticle(context.known, '을')} 적고, 아직 답이 없는 부분은 따로 남겨 둬.`,
      care: `계속하려면 쉴 여유부터 만들어야 해. ${withParticle(context.burden, '을')} 덜 방법을 찾고, ${withParticle(context.aim, '을')} 서두르지 마.`,
      boundary: `어디까지 할 수 있는지 분명히 말해. ${withParticle(context.boundary, '을')} 먼저 정하고, 그 선을 넘는 부탁은 거절해도 돼.`,
      pause: `잠깐 멈춰서 부담을 줄일 차례야. ${context.burden} 중 줄일 것을 고르고, 다시 결정할 날짜를 정해.`,
      release: `같은 행동으로 무엇을 잃는지 살펴봐. ${withParticle(context.habit, '을')} 반복할 때 쓰는 시간과 돈을 적고, 그중 멈출 행동 하나를 골라.`,
      connect: `필요한 도움과 각자 맡을 일을 말로 맞춰. ${withParticle(context.resource, '을')} 함께 쓴다면 누가 무엇을 할지도 정해.`,
      complete: `지금은 해낸 일을 정리할 차례야. ${withParticle(context.sign, '을')} 살펴보고, 남은 일에만 다음 순서를 매겨.`
    };
    connection = next[b];
  }
  if (!connection) throw new Error('tarot_context_unknown_motion');
  return `${bridge} ${connection}`;
}
