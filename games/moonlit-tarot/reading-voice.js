import { splitSummarySentences } from './reading-summary.js?v=20261113-tarot-summary1';

// Editorial voice for the app's own explanations, never for source quotations.
// These reviewed phrases state a card's interpretation or a concrete action.
// Capability verbs stay as written: turning them into a noun can change a warning into advice.
// Unknown grammar stays unchanged; a modal is never removed on its own.
const INTERPRETATIONS = [
  ['고 있을', '고 있는 모습이야'],
  ['남아 있을', '남아 있다는 뜻이야'],
  ['섞여 있을', '섞여 있다는 뜻이야'],
  ['묶여 있을', '묶여 있는 모습이야'],
  ['갇혀 있을', '갇혀 있는 모습이야'],
  ['쌓여 있을', '쌓여 있다는 뜻이야'],
  ['숨어 있을', '숨어 있다는 뜻이야'],
  ['빠져 있을', '빠져 있다는 뜻이야'],
  ['담겨 있을', '담겨 있다는 뜻이야'],
  ['함께 있을', '함께 있다는 뜻이야'],
  ['바람이 있을', '바람이 있다는 뜻이야'],
  ['이어질', '이어지기 쉬워'],
  ['놓칠', '놓치기 쉬워'],
  ['늦어질', '늦어지기 쉬워'],
  ['밀릴', '밀리기 쉬워'],
  ['미룰', '미루기 쉬워'],
  ['흐려질', '흐려지기 쉬워'],
  ['막힐', '막히기 쉬워'],
  ['어긋날', '어긋나기 쉬워'],
  ['반복될', '반복되기 쉬워'],
  ['흔들릴', '흔들리기 쉬워'],
  ['커질', '커지기 쉬워'],
  ['늘어날', '늘어나기 쉬워'],
  ['길어질', '길어지기 쉬워'],
  ['어려워질', '어려워지기 쉬워'],
  ['앞설', '앞서기 쉬워'],
  ['번질', '번지기 쉬워'],
  ['쌓일', '쌓이기 쉬워'],
  ['섞일', '섞이기 쉬워'],
  ['지칠', '지치기 쉬워'],
  ['빠질', '빠지기 쉬워'],
  ['늘', '늘기 쉬워'],
  ['뒤늦게 알', '뒤늦게 알게 되기 쉬워'],
  ['부담이 될', '부담이 되기 쉬워'],
  ['놓치게 할', '놓치게 하기 쉬워'],
  ['어렵게 할', '어렵게 하기 쉬워'],
  ['지치게 할', '지치게 하기 쉬워'],
  ['건너뛰게 할', '건너뛰게 하기 쉬워'],
  ['숨기게 할', '숨기게 하기 쉬워'],
  ['미루게 할', '미루게 하기 쉬워'],
  ['흐리게 할', '흐리게 하기 쉬워'],
  ['붙잡게 할', '붙잡게 하기 쉬워']
];

// A condition stays attached to its benefit; easier does not mean guaranteed.
const CONDITIONAL_BENEFITS = [
  ['줄일', '줄이기 쉬워'],
  ['덜', '덜기 쉬워'],
  ['찾을', '찾기 쉬워'],
  ['고를', '고르기 쉬워'],
  ['정할', '정하기 쉬워'],
  ['남길', '남기기 쉬워'],
  ['알아볼', '알아보기 쉬워'],
  ['확인할', '확인하기 쉬워'],
  ['살펴볼', '살펴보기 쉬워'],
  ['살필', '살피기 쉬워'],
  ['구별할', '구별하기 쉬워'],
  ['구분할', '구분하기 쉬워'],
  ['비교할', '비교하기 쉬워'],
  ['이해할', '이해하기 쉬워'],
  ['이어 갈', '이어 가기 쉬워'],
  ['벗어날', '벗어나기 쉬워'],
  ['만들어 갈', '만들어 가기 쉬워'],
  ['좁혀 갈', '좁혀 가기 쉬워'],
  ['다시 생각할', '다시 생각하기 쉬워'],
  ['지킬', '지키기 쉬워'],
  ['나눌', '나누기 쉬워'],
  ['선택할', '선택하기 쉬워'],
  ['마칠', '마치기 쉬워'],
  ['조정할', '조정하기 쉬워'],
  ['마련할', '마련하기 쉬워'],
  ['보완할', '보완하기 쉬워'],
  ['바꿀', '바꾸기 쉬워'],
  ['받아들일', '받아들이기 쉬워'],
  ['배울', '배우기 쉬워'],
  ['익힐', '익히기 쉬워'],
  ['얻을', '얻기 쉬워'],
  ['만들', '만들기 쉬워'],
  ['드러낼', '드러내기 쉬워']
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
const benefitRules = makeRules(CONDITIONAL_BENEFITS);

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
        const directed = conditional ? applyRules(plain, benefitRules) : plain;
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
