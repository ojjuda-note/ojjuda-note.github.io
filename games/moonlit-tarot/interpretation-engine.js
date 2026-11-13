import { MAJOR_RULES } from './card-rules-major.js?v=20261113-tarot-context1';
import { WANDS_RULES } from './card-rules-wands.js?v=20261113-tarot-context1';
import { CUPS_RULES } from './card-rules-cups.js?v=20261113-tarot-context1';
import { SWORDS_RULES } from './card-rules-swords.js?v=20261113-tarot-context1';
import { PENTACLES_RULES } from './card-rules-pentacles.js?v=20261113-tarot-context1';

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
    focus: '지금 가장 마음에 걸리는 생활의 선택',
    scene: '해야 할 일과 하고 싶은 일이 겹쳐 하루의 순서를 정하기 어려울 때',
    aim: '중요한 일을 하면서도 내 생활을 감당할 여유',
    known: '최근 일주일에 실제로 쓴 시간과 끝낸 일',
    unknown: '지금 반드시 해야 할 일과 미뤄도 되는 일의 차이',
    resource: '이미 해 본 방법과 곁에서 도와줄 사람',
    burden: '쉬는 시간까지 줄이며 모든 일을 혼자 책임지는 수고',
    boundary: '하루에 감당할 일의 양과 꼭 남겨 둘 휴식',
    habit: '마음이 급해질수록 여러 일을 한꺼번에 시작하는 습관',
    small: '오늘 가장 필요한 일 하나를 골라 짧게 해 보기',
    sign: '해야 할 일의 순서가 분명해지고 쉴 틈이 생기는 정도'
  },
  love: {
    focus: '마음이 가는 사람과의 연락과 만남',
    scene: '연락을 이어 가고 싶지만 상대와 편한 속도가 달라 다음 말을 망설일 때',
    aim: '두 사람이 편안하게 마음을 주고받는 관계',
    known: '서로 직접 나눈 말과 실제로 지킨 약속',
    unknown: '각자가 원하는 연락 간격과 관계의 속도',
    resource: '대화가 편했던 경험과 함께 좋아하는 관심사',
    burden: '한 사람만 연락하고 약속을 잡으며 마음을 확인받으려는 수고',
    boundary: '서로 동의한 만남의 속도와 혼자 있을 시간',
    habit: '답이 늦어지면 듣지 못한 상대 마음까지 혼자 결론짓는 습관',
    small: '원하는 연락 방식 한 가지를 차분하게 말하고 상대의 뜻 듣기',
    sign: '한쪽의 재촉 없이 대화와 약속이 이어지는 정도'
  },
  money: {
    focus: '돈을 쓰고 남기는 생활의 선택',
    scene: '사고 싶은 물건이나 새 결제가 생겼는데 매달 필요한 비용도 남아 있을 때',
    aim: '생활에 필요한 돈을 남기면서 원하는 소비를 감당하는 균형',
    known: '최근 결제 내역과 매달 정해진 지출',
    unknown: '처음 낼 금액 외에 계속 드는 비용과 취소 조건',
    resource: '이미 가진 물건과 현재 이용 중인 서비스',
    burden: '잊고 있던 반복 결제와 한꺼번에 몰린 지출',
    boundary: '생활비를 제외하고 이번 달에 감당할 수 있는 금액',
    habit: '필요한 쓰임을 확인하기 전에 할인이나 새로움에 끌려 결제하는 습관',
    small: '결제 내역 하나를 펼쳐 쓰임과 계속 필요한 비용 적기',
    sign: '겹치는 지출을 알아보고 정한 생활비가 남는 정도'
  },
  work: {
    focus: '맡은 일의 진행과 다음 진로 선택',
    scene: '마감이 다가오는데 준비와 의견 조율이 길어져 실제 결과물을 내기 어려울 때',
    aim: '필요한 결과를 내면서도 다음에 쓸 경험을 남기는 일',
    known: '요청받은 결과물과 마감, 지금까지 끝낸 작업',
    unknown: '누가 무엇을 결정하고 어디까지 맡아야 하는지',
    resource: '전에 써 본 도구와 확인된 경험, 함께 일하는 사람의 강점',
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
  return text;
}

// The relationship of two actual cards matters as well as their individual
// meanings. This bridge is used once in the synthesis, not in all 50 topics.
export function connectCards({ left, right, leftName, rightName, leftTheme, rightTheme, context, phase = 'act' }) {
  const a = getCardInterpretation(left.id).motion;
  const b = getCardInterpretation(right.id).motion;
  const bridge = `‘${leftName}’의 ‘${leftTheme}’에서 ‘${rightName}’의 ‘${rightTheme}’으로 초점이 이어져.`;
  if (phase === 'understand') {
    const situation = {
      advance: '앞에서 드러난 마음이 행동을 서두르게 하는지 살펴볼 수 있어. 움직였다는 사실과 필요한 방향으로 나아갔다는 사실을 구별할 때 현재 상황이 또렷해져.',
      review: '처음에 느낀 문제를 다시 해석할 정보가 필요한 흐름이야. 이미 확인한 장면에 나중의 예상이 덧붙지는 않았는지 살피면 판단이 달라진 까닭을 알 수 있어.',
      care: '문제를 감당하는 과정에서 마음과 여유를 얼마나 쓰고 있는지도 드러나. 겉으로 잘 이어지는 일이라도 그 과정을 지탱할 힘이 남아 있는지는 따로 살펴야 해.',
      boundary: '처음의 바람을 현실의 기준에 맞춰 보는 흐름이야. 무엇을 원하는지와 어디까지 감당할 수 있는지가 같지 않다면 그 차이가 지금의 답답함을 설명할 수 있어.',
      pause: '처음 드러난 문제가 지금의 멈춤과 어떻게 이어졌는지 돌아볼 수 있어. 쉬어야 해서 멈춘 것인지, 결정할 정보가 없어 기다리는 것인지 구별하면 다음 선택이 달라져.',
      release: '이전 방식으로 계속하기 어렵다는 신호가 현재 상황의 중심에 놓여 있어. 아직 소중한 목적과 이미 맞지 않게 된 방법을 함께 놓고 구별해 볼 조합이야.',
      connect: '혼자 품은 생각이 다른 조건이나 사람과 만나는 지점이 중요해져. 내 의지만으로 정할 수 있는 일과 상대의 동의가 있어야 하는 일이 나뉘는 흐름이야.',
      complete: '처음의 고민 속에서도 이미 마무리한 부분이나 얻은 경험을 찾아볼 수 있어. 아직 남은 문제가 있다는 이유로 끝낸 일까지 처음부터 다시 할 필요가 있는지는 살펴보렴.'
    };
    return `${bridge} ${situation[b]}`;
  }
  let connection;
  if (a === b) {
    const same = {
      advance: `움직일 힘이 거듭 나오니 시작 자체보다 ${withParticle(context.boundary, '을')} 정하는 일이 중요해져.`,
      review: `확인할 점이 거듭 나오지만 생각만 오래 이어질 수도 있어. ${withParticle(context.unknown, '을')} 하나씩 실제 근거로 바꿀 질문이 필요해.`,
      care: `돌봄의 뜻이 이어지는 만큼 ${withParticle(context.burden, '이')} 한 사람에게 쌓이지 않는지가 중요해.`,
      boundary: `지켜야 할 기준이 두 번 강조돼. ${withParticle(context.boundary, '을')} 지키면서도 달라진 조건에 맞게 고칠 여지는 남겨 두렴.`,
      pause: `멈춤의 뜻이 겹치므로 지금 더 힘을 쓰기 전에 ${withParticle(context.burden, '을')} 덜어 낼 자리가 필요한 조합이야.`,
      release: `놓아줄 부분을 연달아 비추는 조합이야. ${withParticle(context.habit, '을')} 내려놓는 것과 ${withParticle(context.aim, '을')} 포기하는 것을 구별해 보렴.`,
      connect: `혼자 해결하기보다 역할과 뜻을 나누는 힘이 이어져. ${withParticle(context.resource, '을')} 어떻게 함께 쓸지 구체적으로 정해 보렴.`,
      complete: `지금까지 해낸 것을 알아보고 정리하는 뜻이 이어져. ${context.known}에서 다음에도 남길 것을 고르는 단계로 읽을 수 있어.`
    };
    // '에서' is a fixed suffix; it is intentionally outside the particle helper.
    connection = same[b];
  } else if (a === 'advance' && ['pause', 'review', 'boundary'].includes(b)) {
    connection = `시작하려는 마음과 속도를 조절할 필요가 함께 있어. ${withParticle(context.unknown, '을')} 채우지 않은 채 서두르면 같은 지점에서 다시 막힐 수 있지.`;
  } else if (['pause', 'review'].includes(a) && b === 'advance') {
    connection = `생각하거나 기다리던 흐름에 실행의 뜻이 들어와. 모든 답을 한꺼번에 얻으려 하기보다 ${context.small}처럼 되돌릴 수 있는 행동으로 판단할 근거를 만들 수 있어.`;
  } else if (a === 'release' && ['care', 'connect'].includes(b)) {
    connection = `정리하는 마음 뒤에 돌봄과 연결의 자리가 나타나. ${withParticle(context.burden, '을')} 혼자 버티기보다 ${withParticle(context.resource, '을')} 다시 쓸 수 있는지가 중요해.`;
  } else {
    const next = {
      advance: `이 생각을 움직임으로 옮길 차례로 읽혀. ${context.small}부터 해 보면 ${withParticle(context.unknown, '을')} 실제로 알아볼 수 있어.`,
      review: `지금은 판단의 근거를 다듬는 쪽에 무게가 실려. ${withParticle(context.known, '과')} 아직 모르는 조건을 나누어 보렴.`,
      care: `결과를 재촉하는 것보다 지속할 여건을 돌보는 쪽으로 무게가 옮겨가. ${withParticle(context.burden, '을')} 줄일 여유가 있어야 ${context.aim}도 이어질 수 있어.`,
      boundary: `마음을 이해한 뒤에는 지킬 기준을 정할 필요가 있어. ${withParticle(context.boundary, '을')} 말로 드러내야 어디까지 함께할 수 있는지도 분명해져.`,
      pause: `당장 더 밀어붙이는 것보다 멈춰서 조정하는 쪽에 무게가 실려. ${withParticle(context.burden, '을')} 덜고 다시 볼 시점을 정해 보렴.`,
      release: `앞의 흐름을 그대로 늘리기보다 끝낼 부분을 가려내는 쪽에 무게가 실려. ${withParticle(context.habit, '을')} 반복할 때 무엇을 잃는지 보렴.`,
      connect: `혼자 품은 생각을 다른 사람과 맞춰 보는 쪽으로 흐름이 이어져. ${withParticle(context.resource, '을')} 함께 쓰려면 필요한 도움과 맡을 몫을 구체적으로 말해야 해.`,
      complete: `새 일을 더하기 전에 이미 해낸 것을 정리하는 쪽으로 읽혀. ${context.sign}에 비추어 무엇이 남았는지 확인하면 다음 선택의 기준이 생겨.`
    };
    connection = next[b];
  }
  if (!connection) throw new Error('tarot_context_unknown_motion');
  return `${bridge} ${connection}`;
}
