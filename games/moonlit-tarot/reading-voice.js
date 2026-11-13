import { splitSummarySentences } from './reading-summary.js?v=20261113-tarot-summary1';

// Editorial voice for the app's own explanations, never for source quotations.
// These reviewed phrases state a card's interpretation or a concrete action.
// Unknown grammar stays unchanged; a modal is never removed on its own.
const INTERPRETATIONS = [
  ['고 있을', '고 있는 모습을 짚어'],
  ['남아 있을', '남아 있는 모습을 짚어'],
  ['섞여 있을', '섞여 있는 모습을 짚어'],
  ['묶여 있을', '묶여 있는 모습을 짚어'],
  ['갇혀 있을', '갇혀 있는 모습을 짚어'],
  ['쌓여 있을', '쌓여 있는 부담을 짚어'],
  ['숨어 있을', '숨어 있는 부분을 짚어'],
  ['빠져 있을', '빠져 있는 부분을 짚어'],
  ['담겨 있을', '담겨 있는 뜻을 짚어'],
  ['함께 있을', '함께 있는 모습을 짚어'],
  ['바람이 있을', '바람이 있다는 해석이야'],
  ['이어질', '이어지는 흐름을 뜻해'],
  ['놓칠', '놓치는 문제를 경고해'],
  ['가릴', '가리는 점을 짚어'],
  ['늦어질', '늦어지는 문제를 짚어'],
  ['밀릴', '밀리는 상황을 짚어'],
  ['미룰', '미루는 태도를 짚어'],
  ['흐려질', '흐려지는 지점을 짚어'],
  ['막힐', '막히는 지점을 짚어'],
  ['어긋날', '어긋나는 부분을 경고해'],
  ['반복될', '반복되는 모습을 짚어'],
  ['흔들릴', '흔들리는 상황을 짚어'],
  ['흔들', '흔드는 요인을 짚어'],
  ['생길', '생기는 변화를 보여 줘'],
  ['달라질', '달라지는 흐름을 뜻해'],
  ['바뀔', '바뀌는 흐름을 뜻해'],
  ['커질', '커지는 흐름을 짚어'],
  ['늘어날', '늘어나는 흐름을 짚어'],
  ['줄어들', '줄어드는 변화를 짚어'],
  ['길어질', '길어지는 흐름을 짚어'],
  ['어려워질', '어려워지는 부분을 짚어'],
  ['나올', '나오는 모습을 짚어'],
  ['쉬워질', '쉬워지는 방향을 제시해'],
  ['분명해질', '분명해지는 지점을 보여 줘'],
  ['선명해질', '선명해지는 지점을 보여 줘'],
  ['드러날', '드러나는 지점을 보여 줘'],
  ['보일', '보이는 모습을 짚어'],
  ['느껴질', '느껴지는 상황을 짚어'],
  ['느낄', '느끼는 마음을 비춰'],
  ['바랄', '바라는 마음을 비춰'],
  ['원할', '원하는 마음을 비춰'],
  ['싶을', '싶어 하는 마음을 비춰'],
  ['움직일', '움직이는 모습을 보여 줘'],
  ['필요할', '필요한 점을 짚어'],
  ['어려울', '어려운 상황을 짚어'],
  ['중요할', '중요한 기준이라고 짚어'],
  ['남을', '남는 모습을 짚어'],
  ['앞설', '앞서는 모습을 짚어'],
  ['번질', '번지는 문제를 경고해'],
  ['쌓일', '쌓이는 과정을 보여 줘'],
  ['섞일', '섞이는 지점을 짚어'],
  ['지칠', '지치는 상황을 경고해'],
  ['빠질', '빠지는 부분을 짚어'],
  ['사라질', '사라지는 변화를 짚어'],
  ['더해질', '더해지는 흐름을 짚어'],
  ['넓어질', '넓어지는 방향을 보여 줘'],
  ['좁아질', '좁아지는 부분을 짚어'],
  ['늘', '늘어나는 흐름을 짚어'],
  ['만들', '만드는 모습을 짚어'],
  ['줄일', '줄이는 방법을 제시해'],
  ['알아볼', '알아보는 과정을 보여 줘'],
  ['살펴볼', '살펴보는 태도를 보여 줘'],
  ['살필', '살피는 태도를 보여 줘'],
  ['확인할', '확인하는 과정을 짚어'],
  ['돌아볼', '돌아보는 해석이야'],
  ['고를', '고르는 모습을 보여 줘'],
  ['찾을', '찾는 모습을 짚어'],
  ['지킬', '지키는 모습을 보여 줘'],
  ['정할', '정하는 선택을 짚어'],
  ['남길', '남기는 선택을 짚어'],
  ['나눌', '나누는 방법을 제시해'],
  ['구별할', '구별하는 방식을 보여 줘'],
  ['구분할', '구분하는 방식을 보여 줘'],
  ['비교할', '비교하는 방식을 보여 줘'],
  ['선택할', '선택하는 모습을 짚어'],
  ['배울', '배우는 과정을 보여 줘'],
  ['익힐', '익히는 과정을 보여 줘'],
  ['얻을', '얻는 과정을 보여 줘'],
  ['조정할', '조정하는 방법을 제시해'],
  ['마련할', '마련하는 방법을 제시해'],
  ['보완할', '보완하는 방법을 제시해'],
  ['덜', '덜어내는 방법을 제시해'],
  ['뒤늦게 알', '뒤늦게 알게 되는 상황을 짚어'],
  ['바꿀', '바꾸는 선택을 짚어'],
  ['벗어날', '벗어나는 방향을 제시해'],
  ['옮길', '옮기는 선택을 짚어'],
  ['말할', '말로 드러내는 모습을 짚어'],
  ['표현할', '표현하는 방법을 제시해'],
  ['도울', '돕는 역할을 짚어'],
  ['이어 갈', '이어 가는 모습을 보여 줘'],
  ['만들어 갈', '만들어 가는 과정을 보여 줘'],
  ['좁혀 갈', '좁혀 가는 과정을 보여 줘'],
  ['넘길', '넘기는 선택을 짚어'],
  ['받아들일', '받아들이는 태도를 짚어'],
  ['판단할', '판단하는 방식을 짚어'],
  ['기대할', '기대하는 마음을 비춰'],
  ['중요하게 볼', '중요하게 보는 태도를 보여 줘'],
  ['성취로 볼', '성취로 인정하는 해석이야'],
  ['영향을 줄', '영향을 주는 모습을 짚어'],
  ['도움을 줄', '도움을 주는 방식을 보여 줘'],
  ['알려 줄', '알려 주는 단서야'],
  ['보여 줄', '보여 주는 모습을 짚어'],
  ['이어 줄', '이어 주는 역할을 짚어'],
  ['줄여 줄', '줄여 주는 역할을 짚어'],
  ['넓혀 줄', '넓혀 주는 역할을 짚어'],
  ['만들어 줄', '만들어 주는 역할을 짚어'],
  ['도움이 될', '도움이 된다는 해석이야'],
  ['단서가 될', '단서가 된다는 해석이야'],
  ['기준이 될', '기준이 된다는 해석이야'],
  ['근거가 될', '근거가 된다는 해석이야'],
  ['바탕이 될', '바탕이 된다는 해석이야'],
  ['동력이 될', '동력이 된다는 해석이야'],
  ['힘이 될', '힘이 된다는 해석이야'],
  ['부담이 될', '부담이 되는 점을 경고해'],
  ['통로가 될', '통로가 된다는 해석이야'],
  ['시작이 될', '시작점이 된다는 해석이야'],
  ['때일', '때를 가리켜'],
  ['느끼게 할', '느끼게 하는 상황을 짚어'],
  ['놓치게 할', '놓치게 하는 문제를 경고해'],
  ['어렵게 할', '어렵게 하는 요인을 짚어'],
  ['보이게 할', '보이게 하는 상황을 짚어'],
  ['지치게 할', '지치게 하는 문제를 경고해'],
  ['건너뛰게 할', '건너뛰게 하는 문제를 경고해'],
  ['숨기게 할', '숨기게 하는 태도를 짚어'],
  ['떠올리게 할', '떠올리게 하는 계기를 짚어'],
  ['끌리게 할', '끌리게 하는 마음을 짚어'],
  ['미루게 할', '미루게 하는 문제를 짚어'],
  ['흐리게 할', '흐리게 하는 문제를 짚어'],
  ['붙잡게 할', '붙잡게 하는 마음을 짚어'],
  ['찾게 할', '찾게 하는 마음을 비춰'],
  ['확인하게 할', '확인하게 하는 모습을 짚어'],
  ['만나게 할', '만나게 하는 흐름을 뜻해'],
  ['이해하려 할', '이해하려 하는 태도를 짚어']
];

// A conditional benefit is a direction to work toward, not a promised event.
const CONDITIONAL_GOALS = [
  ['줄일', '줄이는 게 목표야'], ['덜', '덜어내는 게 목표야'],
  ['찾을', '찾는 게 목표야'], ['고를', '고르는 게 목표야'],
  ['정할', '정하는 게 목표야'], ['남길', '남기는 게 목표야'],
  ['알아볼', '알아보는 게 목표야'], ['확인할', '확인하는 게 목표야'],
  ['살펴볼', '살펴보는 게 목표야'], ['살필', '살피는 게 목표야'],
  ['구별할', '구별하는 게 목표야'], ['구분할', '구분하는 게 목표야'],
  ['비교할', '비교하는 게 목표야'], ['이해할', '이해하는 게 목표야'],
  ['이어 갈', '이어 가는 게 목표야'], ['벗어날', '벗어나는 게 목표야'],
  ['만들어 갈', '만들어 가는 게 목표야'], ['좁혀 갈', '좁혀 가는 게 목표야'],
  ['다시 생각할', '다시 생각하는 게 목표야'], ['지킬', '지키는 게 목표야'],
  ['나눌', '나누는 게 목표야'], ['선택할', '선택하는 게 목표야'],
  ['마칠', '마치는 게 목표야'], ['조정할', '조정하는 게 목표야'],
  ['마련할', '마련하는 게 목표야'], ['보완할', '보완하는 게 목표야'],
  ['바꿀', '바꾸는 게 목표야'], ['받아들일', '받아들이는 게 목표야'],
  ['배울', '배우는 게 목표야'], ['익힐', '익히는 게 목표야'],
  ['얻을', '얻는 게 목표야'], ['만들', '만드는 게 목표야'],
  ['드러낼', '드러내는 게 목표야']
];

const ACTIONS = [
  ['살펴볼', '살펴봐'], ['살필', '살펴봐'],
  ['확인해 볼', '확인해 봐'], ['확인할', '확인해'],
  ['생각해 볼', '생각해 봐'], ['돌아볼', '돌아봐'],
  ['알아볼', '알아봐'], ['물어볼', '물어봐'],
  ['비교해 볼', '비교해 봐'], ['비교할', '비교해'],
  ['구별할', '구별해'], ['구분할', '구분해'],
  ['기록할', '기록해'], ['적어 볼', '적어 봐'],
  ['정리할', '정리해'], ['정할', '정해'],
  ['나눌', '나눠'], ['조정할', '조정해'],
  ['골라 볼', '골라 봐'], ['고를', '골라'],
  ['시도해 볼', '시도해 봐'], ['시도할', '시도해'],
  ['해 볼', '해 봐'], ['맞춰 볼', '맞춰 봐'],
  ['준비할', '준비해'], ['점검할', '점검해'],
  ['설명할', '설명해'], ['질문할', '질문해'],
  ['말할', '말해'], ['요청할', '요청해'],
  ['선택할', '직접 선택해'], ['판단할', '판단해'],
  ['활용할', '활용해'], ['배울', '배워'],
  ['익힐', '익혀'], ['표현할', '표현해'],
  ['찾아볼', '찾아봐'], ['찾을', '찾아봐'],
  ['남길', '남겨'], ['지킬', '지켜'],
  ['나누어 볼', '나누어 봐'], ['가져갈', '가져가']
];

function makeRules(entries) {
  return [...entries].sort((a, b) => b[0].length - a[0].length).map(([phrase, replacement]) => {
    // Every Korean ending is named above. No generated Korean conjugation.
    const boundary = phrase === '고 있을' ? '' : '(?<![가-힣])';
    return [new RegExp(`${boundary}${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} 수(?:도)? 있(?:어|지|겠지)(?=[.!?。！？]|$)`, 'gu'), replacement];
  });
}
const interpretationRules = makeRules(INTERPRETATIONS);
const actionRules = makeRules(ACTIONS);
const goalRules = makeRules(CONDITIONAL_GOALS);

// Keep quoted dialogue, card terminology and quoted source text byte-for-byte.
function outsideQuotes(text, transform) {
  const pairs = { '‘': '’', '“': '”', '「': '」', '『': '』', '"': '"', "'": "'" };
  let result = '', plain = '', quoted = '', stack = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (stack.length) {
      quoted += character;
      if (character === stack.at(-1)) stack.pop();
      else if (Object.hasOwn(pairs, character)) stack.push(pairs[character]);
      if (!stack.length) { result += quoted; quoted = ''; }
    } else if (Object.hasOwn(pairs, character)
        && !(character === "'" && /[\p{L}\p{N}]/u.test(text[index - 1] || '') && /[\p{L}\p{N}]/u.test(text[index + 1] || ''))) {
      result += transform(plain); plain = ''; quoted = character; stack.push(pairs[character]);
    } else plain += character;
  }
  // An unfinished quote is still quotation, not editorial text to rewrite.
  return result + transform(plain) + quoted;
}

function applyRules(text, rules) {
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

function protectedSentence(text) {
  return /(?:진단|질병|치료|복용|의료|약물|검사 결과|임신|사망|수명|사고 날짜)/u.test(text)
    || /(?:알 수 없|판단할 수 없|단정할 수|확정할 수|보장할 수|뜻하는 것은 아니|의미하는 것은 아니)/u.test(text)
    || /(?:거절|동의|연락 중단|연락하지 말|차단|무응답)/u.test(text);
}

function hasCondition(text) {
  const nouns = new Set(['장면', '화면', '반면', '측면', '내면', '국면', '수면', '전면', '뒷면', '이면']);
  return [...text.matchAll(/([가-힣]+면)(?=[,\s]|$)/gu)].some(match => !nouns.has(match[1]));
}

function revise(text, mode) {
  const value = String(text ?? '');
  // Preserve paragraph separators; only replace reviewed sentence-end phrases.
  return value.split(/(\n+)/u).map(part => {
    if (/^\n+$/u.test(part)) return part;
    return splitSummarySentences(part).map(sentence => {
      if (protectedSentence(sentence) || /(?:예를 들어|가령|가상 장면)/u.test(sentence)) return sentence;
      let editorial = '';
      outsideQuotes(sentence, plain => { editorial += plain; return plain; });
      const conditional = hasCondition(editorial)
        && !/(?:뒤늦게|잘못|성급|무리하게|함부로|덜\s+(?:살필|살펴볼|확인할|비교할|구분할)|놓치|건너뛰)/u.test(editorial);
      return outsideQuotes(sentence, plain => {
        if (mode === 'action') return applyRules(plain, actionRules);
        const directed = conditional ? applyRules(plain, goalRules) : plain;
        return applyRules(directed, interpretationRules);
      });
    }).join(' ');
  }).join('');
}

export function directInterpretation(text) { return revise(text, 'interpretation'); }
export function directAction(text) { return revise(text, 'action'); }
export function directCardAdvice(text) {
  const sentences = splitSummarySentences(text);
  return sentences.map((sentence, index) => index === 0 ? directInterpretation(sentence) : directAction(sentence)).join(' ');
}
