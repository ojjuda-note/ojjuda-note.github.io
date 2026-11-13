import { MAJOR_RULES } from './card-rules-major.js?v=20261113-tarot-context1';
import { WANDS_RULES } from './card-rules-wands.js?v=20261113-tarot-direct1';
import { CUPS_RULES } from './card-rules-cups.js?v=20261113-tarot-context1';
import { SWORDS_RULES } from './card-rules-swords.js?v=20261113-tarot-context1';
import { PENTACLES_RULES } from './card-rules-pentacles.js?v=20261113-tarot-context1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261113-tarot-direct1';

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
    focus: '일과 휴식의 우선순위',
    scene: '해야 할 일과 하고 싶은 일이 겹쳐 하루의 순서를 정하기 어려울 때',
    aim: '중요한 일과 휴식의 균형',
    known: '지난 일주일의 일정과 끝낸 일',
    unknown: '지금 반드시 해야 할 일과 미뤄도 되는 일의 차이',
    resource: '전에 썼던 방법과 도와줄 사람',
    burden: '혼자 떠안은 일과 부족한 휴식',
    boundary: '하루 업무량과 꼭 남겨 둘 휴식',
    habit: '마음이 급해질수록 여러 일을 한꺼번에 시작하는 습관',
    small: '오늘 가장 필요한 일 하나를 골라 짧게 해 보기',
    sign: '해야 할 일의 순서가 분명해지고 쉴 틈이 생기는 정도'
  },
  love: {
    focus: '상대와의 연락과 만남',
    scene: '연락을 이어 가고 싶지만 상대와 편한 속도가 달라 다음 말을 망설일 때',
    aim: '서로 편하게 마음을 주고받는 관계',
    known: '서로 직접 나눈 말과 실제로 지킨 약속',
    unknown: '각자가 원하는 연락 간격과 관계의 속도',
    resource: '대화가 편했던 경험과 함께 좋아하는 관심사',
    burden: '한 사람만 연락하고 약속을 잡는 수고',
    boundary: '서로 동의한 만남의 속도와 혼자 있을 시간',
    habit: '답이 늦어지면 듣지 못한 상대 마음까지 혼자 결론짓는 습관',
    small: '원하는 연락 방식 한 가지를 차분하게 말하고 상대의 뜻 듣기',
    sign: '한쪽의 재촉 없이 대화와 약속이 이어지는 정도'
  },
  money: {
    focus: '지출과 저축',
    scene: '사고 싶은 물건이나 새 결제가 생겼는데 매달 필요한 비용도 남아 있을 때',
    aim: '생활비를 지키는 소비 계획',
    known: '최근 결제 내역과 고정 지출',
    unknown: '추가 비용과 취소 조건',
    resource: '이미 가진 물건과 현재 이용 중인 서비스',
    burden: '잊고 있던 반복 결제와 한꺼번에 몰린 지출',
    boundary: '이번 달 생활비를 뺀 지출 한도',
    habit: '필요한 쓰임을 확인하기 전에 할인이나 새로움에 끌려 결제하는 습관',
    small: '결제 내역 하나를 펼쳐 쓰임과 계속 필요한 비용 적기',
    sign: '겹치는 지출을 알아보고 정한 생활비가 남는 정도'
  },
  work: {
    focus: '맡은 업무와 다음 진로',
    scene: '마감이 다가오는데 준비와 의견 조율이 길어져 실제 결과물을 내기 어려울 때',
    aim: '요청받은 결과와 다음에 쓸 경험',
    known: '요청받은 결과물과 마감, 끝낸 작업',
    unknown: '누가 무엇을 결정하고 어디까지 맡아야 하는지',
    resource: '익숙한 도구와 경험, 동료의 강점',
    burden: '역할이 정해지지 않은 채 늘어나는 요청과 마감',
    boundary: '맡을 범위와 가능한 시간, 결과물을 확인할 기준',
    habit: '완벽한 준비를 기다리거나 요청을 모두 받아 실제 작업을 미루는 습관',
    small: '확인이 필요한 부분을 담은 작은 초안 하나 만들기',
    sign: '담당과 다음 작업이 분명해지고 결과물을 확인할 수 있는 정도'
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
  const bridge = `‘${leftName}’의 ‘${leftTheme}’에서 ‘${rightName}’의 ‘${rightTheme}’으로 초점이 이어져.`;
  if (phase === 'understand') {
    const situation = {
      advance: '이 조합의 핵심은 마음이 앞서 행동을 서두르는지 확인하는 일이야. 얼마나 많이 움직였는지보다 필요한 일을 실제로 끝냈는지를 먼저 따져 봐.',
      review: '이 조합은 처음 판단을 다시 확인하라고 말해. 직접 확인한 사실과 나중에 덧붙인 예상을 나누고, 판단을 바꾼 근거를 찾아봐.',
      care: '이 조합이 강조하는 것은 일을 감당할 마음과 여유야. 겉으로 일이 진행돼도 휴식과 도움을 받을 시간이 남아 있는지 따로 확인해.',
      boundary: '이 조합은 원하는 것과 감당할 범위를 맞추라고 말해. 둘이 어긋난다면 원하는 조건을 줄이거나 맡을 몫을 나누는 것부터 시작해.',
      pause: '이 조합의 쟁점은 멈춘 이유야. 쉬어야 해서 멈춘 것인지, 결정할 정보가 없어 기다리는 것인지 구분한 뒤 휴식이나 확인할 질문부터 정해.',
      release: '이 조합은 목적을 지키면서 맞지 않는 방법을 끝내라는 뜻이야. 계속 이루고 싶은 목적과 그 목적에 더는 도움이 되지 않는 방법을 따로 적어.',
      connect: '이 조합은 혼자 정할 일과 함께 합의할 일을 구별하라는 뜻이야. 내 선택만으로 정할 부분을 먼저 고르고, 상대의 몫과 동의가 필요한 부분은 직접 물어봐.',
      complete: '이 조합은 이미 끝낸 일과 거기서 얻은 경험을 먼저 정리하라는 뜻이야. 끝낸 일은 남겨 두고, 아직 처리하지 못한 부분을 따로 골라.'
    };
    return `${bridge} ${situation[b]}`;
  }
  let connection;
  if (a === b) {
    const same = {
      advance: `두 카드 모두 실행을 강조해. 시작하기 전에 ${withParticle(context.boundary, '을')} 먼저 정해.`,
      review: `두 카드 모두 확인을 강조하지만, 검토만 반복하는 것이 답은 아니야. ${withParticle(context.unknown, '을')} 직접 물어볼 질문으로 나누고 하나씩 답을 확인해.`,
      care: `돌봄이 거듭 강조되는 조합이야. ${withParticle(context.burden, '이')} 한 사람에게 몰리지 않는지 확인하고, 맡을 일과 쉬는 시간을 정해.`,
      boundary: `두 카드 모두 지킬 기준을 우선하라는 뜻이야. ${withParticle(context.boundary, '을')} 지키되 조건이 바뀌면 기준도 다시 맞춰.`,
      pause: `두 장의 멈춤은 힘을 더 쓰기 전에 부담부터 덜라는 뜻이야. ${withParticle(context.burden, '을')} 줄일 항목과 다시 판단할 시점을 정해.`,
      release: `놓아야 할 것을 골라내는 것이 이 조합의 핵심이야. ${withParticle(context.habit, '을')} 중단하는 일과 ${withParticle(context.aim, '을')} 포기하는 일은 다르니, 계속 지킬 목적을 분명히 정해.`,
      connect: `두 카드가 강조하는 해법은 역할과 뜻을 나누는 일이야. ${withParticle(context.resource, '을')} 어떻게 쓸지 정하고, 함께할 일이 있다면 각자의 몫도 나눠.`,
      complete: `두 카드 모두 이미 해낸 일을 정리하라는 뜻이야. ${context.known}에서 다음에도 쓸 방법과 더 고칠 부분을 골라.`
    };
    // '에서' is a fixed suffix; it is intentionally outside the particle helper.
    connection = same[b];
  } else if (a === 'advance' && ['pause', 'review', 'boundary'].includes(b)) {
    connection = `이 조합은 시작하기 전에 빠진 조건부터 확인하라는 뜻이야. ${withParticle(context.unknown, '을')} 확인하지 않은 채 서두르지 말고, 그 답에 맞춰 진행 순서를 정해.`;
  } else if (['pause', 'review'].includes(a) && b === 'advance') {
    connection = `이 조합은 검토한 내용을 작은 행동으로 확인하라는 뜻이야. ${context.small}처럼 되돌릴 수 있는 행동부터 하고, 실제 결과로 다음 결정을 내려.`;
  } else if (a === 'release' && ['care', 'connect'].includes(b)) {
    connection = `정리 뒤에 필요한 것은 돌봄과 도움을 다시 확보하는 일이야. ${withParticle(context.burden, '을')} 혼자 버티지 말고, ${context.resource} 가운데 실제로 쓸 수 있는 도움을 골라.`;
  } else {
    const next = {
      advance: `이 조합의 다음 단계는 작은 실행이야. ${context.small}부터 하고, 해 본 결과와 직접 받은 답을 바탕으로 ${withParticle(context.unknown, '을')} 확인해.`,
      review: `지금 먼저 할 일은 판단의 근거를 정리하는 거야. ${withParticle(context.known, '과')} 아직 모르는 조건을 구분하고, 모르는 내용은 아는 것처럼 결론 내리지 마.`,
      care: `이 조합이 요구하는 것은 계속할 여유를 먼저 확보하는 일이야. ${withParticle(context.aim, '을')} 이어 가려면 ${withParticle(context.burden, '을')} 줄일 시간과 도움부터 마련해.`,
      boundary: `이 조합의 해법은 지킬 범위를 말로 정하는 거야. ${withParticle(context.boundary, '을')} 먼저 밝히고, 그 안에서 해도 되는 일과 거절할 일을 구분해.`,
      pause: `지금 필요한 행동은 멈춰서 부담을 조정하는 거야. ${withParticle(context.burden, '을')} 줄이는 데 오늘 쓸 시간을 먼저 비워 두고, 다시 판단할 날짜를 정해.`,
      release: `이 조합은 반복을 멈추고 끝낼 일을 고르라고 말해. ${withParticle(context.habit, '을')} 반복해서 잃는 시간이나 비용을 적고, 그중 끊을 행동 하나를 정해.`,
      connect: `이 조합의 해법은 생각과 역할을 말로 맞추는 일이야. ${withParticle(context.resource, '을')} 함께 쓰려면 필요한 도움과 맡을 몫을 구체적으로 말해야 해.`,
      complete: `지금은 이미 해낸 결과를 정리할 차례야. ${withParticle(context.sign, '을')} 확인한 뒤, 끝낸 일과 남은 일을 나누어 다음 순서를 정해.`
    };
    connection = next[b];
  }
  if (!connection) throw new Error('tarot_context_unknown_motion');
  return `${bridge} ${connection}`;
}
