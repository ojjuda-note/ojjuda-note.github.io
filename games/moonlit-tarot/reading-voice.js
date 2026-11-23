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
    return [new RegExp(`${boundary}${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} 수(?:도)? 있(?:다|어|지|겠지)(?=[.!?。！？]|$)`, 'gu'), replacement];
  });
}
const interpretationRules = makeRules(INTERPRETATIONS);
const POLITE_ACTIONS = {
  '살펴봐': '살펴보세요', '확인해 봐': '확인하세요', '생각해 봐': '생각해 보세요',
  '돌아봐': '돌아보세요', '알아봐': '알아보세요', '물어봐': '물어보세요',
  '비교해 봐': '비교하세요', '적어 봐': '적으세요', '나눠': '나누세요',
  '골라 봐': '고르세요', '골라': '고르세요', '시도해 봐': '시도하세요',
  '해 봐': '해 보세요', '맞춰 봐': '맞춰 보세요', '배워': '배우세요',
  '익혀': '익히세요', '찾아봐': '찾아보세요', '남겨': '남기세요',
  '지켜': '지키세요', '나누어 봐': '나누세요', '가져가': '가져가세요'
};
const actionRules = makeRules(ACTIONS.map(([phrase, replacement]) => [
  phrase, POLITE_ACTIONS[replacement] || replacement.replace(/해$/u, '하세요')
]));
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

// Reviewed endings for our own Korean prose. This changes the register, not
// the likelihood of an event. Unknown verbs and all quotations stay intact.
// In particular, "can", "cannot", conditions and negative outcomes are not
// deleted to make a prediction sound certain.
const NARRATIVE_ENDINGS = [
  ['살펴볼 필요가 있다', '살펴야 해요'], ['살필 필요가 있다', '살펴야 해요'],
  ['확인할 필요가 있다', '확인해야 해요'], ['나눌 필요가 있다', '나눠야 해요'],
  ['구분할 필요가 있다', '구분해야 해요'], ['정할 필요가 있다', '정해야 해요'],
  ['않았다', '않았어요'], ['못한다', '못해요'], ['아니다', '아니에요'],
  ['않는다', '않아요'], ['않다', '않아요'], ['있다', '있어요'], ['없다', '없어요'],
  ['어렵다', '어려워요'], ['쉽다', '쉬워요'], ['싶다', '싶어요'],
  ['괜찮다', '괜찮아요'], ['다르다', '달라요'], ['빠르다', '빨라요'],
  ['느리다', '느려요'], ['크다', '커요'], ['적다', '적어요'], ['좋다', '좋아요'],
  ['무겁다', '무거워요'], ['가볍다', '가벼워요'], ['조심스럽다', '조심스러워요'],
  ['줄어든다', '줄어들어요'], ['만든다', '만들어요'], ['힘든다', '힘들어요'],
  ['어려워한다', '어려워해요'], ['조심스러워한다', '조심스러워해요'],
  ['생긴다', '생겨요'], ['느낀다', '느껴요'], ['여긴다', '여겨요'],
  ['쓰인다', '쓰여요'], ['보인다', '보여요'], ['놓인다', '놓여요'],
  ['쌓인다', '쌓여요'], ['나뉜다', '나뉘어요'], ['바뀐다', '바뀌어요'],
  ['줄인다', '줄여요'], ['늘린다', '늘려요'], ['살린다', '살려요'], ['남긴다', '남겨요'],
  ['떠올린다', '떠올려요'], ['기다린다', '기다려요'], ['망설인다', '망설여요'],
  ['부딪힌다', '부딪혀요'], ['걸린다', '걸려요'], ['밀린다', '밀려요'],
  ['갈린다', '갈려요'], ['흔들린다', '흔들려요'], ['풀린다', '풀려요'],
  ['헷갈린다', '헷갈려요'], ['불린다', '불려요'], ['지킨다', '지켜요'],
  ['붙잡는다', '붙잡아요'], ['잡는다', '잡아요'], ['남는다', '남아요'],
  ['받는다', '받아요'], ['찾는다', '찾아요'], ['묻는다', '물어요'],
  ['믿는다', '믿어요'], ['되짚는다', '되짚어요'], ['끌린다', '끌려요'],
  ['나눈다', '나눠요'], ['다룬다', '다뤄요'], ['챙긴다', '챙겨요'],
  ['오르내린다', '오르내려요'], ['알아차린다', '알아차려요'],
  ['쏠린다', '쏠려요'], ['지친다', '지쳐요'], ['섞인다', '섞여요'],
  ['움직인다', '움직여요'], ['보낸다', '보내요'], ['쓴다', '써요'],
  ['고친다', '고쳐요'], ['넘긴다', '넘겨요'], ['맞춘다', '맞춰요'], ['삼는다', '삼아요'],
  ['비춘다', '비춰요'], ['살핀다', '살펴요'], ['나타낸다', '나타내요'],
  ['어울린다', '어울려요'], ['바꾼다', '바꿔요'], ['쉰다', '쉬어요'],
  ['낯설다', '낯설어요'], ['싫다', '싫어요'], ['당황스럽다', '당황스러워요'],
  ['자연스럽다', '자연스러워요'],
  ['듣는다', '들어요'], ['얻는다', '얻어요'], ['잃는다', '잃어요'],
  ['읽는다', '읽어요'], ['적는다', '적어요'], ['닫는다', '닫아요'],
  ['쌓는다', '쌓아요'], ['맡는다', '맡아요'], ['놓는다', '놓아요'],
  ['고른다', '골라요'], ['모른다', '몰라요'], ['떠오른다', '떠올라요'],
  ['머문다', '머물러요'], ['멈춘다', '멈춰요'], ['기운다', '기울어요'],
  ['앞선다', '앞서요'], ['바란다', '바라요'], ['자란다', '자라요'],
  ['돌본다', '돌봐요'], ['본다', '봐요'], ['준다', '줘요'], ['둔다', '둬요'],
  ['든다', '들어요'], ['간다', '가요'], ['온다', '와요'], ['난다', '나요'],
  ['진다', '져요'], ['된다', '돼요'], ['한다', '해요'], ['하다', '해요'],
  ['것이다', '거예요'], ['때다', '때예요'], ['차례다', '차례예요'],
  ['카드다', '카드예요'], ['태도다', '태도예요'], ['문제다', '문제예요'],
  ['성취다', '성취예요'], ['기회다', '기회예요'], ['단계다', '단계예요'],
  ['단서다', '단서예요'], ['일부다', '일부예요'], ['먼저다', '먼저예요'],
  ['자세다', '자세예요'], ['거다', '거예요'], ['별개다', '별개예요'],
  ['준비다', '준비예요'], ['이유다', '이유예요'], ['상태다', '상태예요'],
  ['변화다', '변화예요'], ['용기다', '용기예요'], ['이야기다', '이야기예요'], ['열쇠다', '열쇠예요'],
  ['맞다', '맞아요'], ['가깝다', '가까워요']
];
const INSTRUCTION_ENDINGS = [
  ['해 본다', '하세요'], ['정해 본다', '정하세요'], ['골라 본다', '고르세요'],
  ['줄여 본다', '줄이세요'], ['만들어 본다', '만드세요'], ['맞춰 본다', '맞추세요'],
  ['나눠 본다', '나누세요'], ['나누어 본다', '나누세요'], ['남겨 본다', '남기세요'],
  ['바꿔 본다', '바꾸세요'], ['느껴 본다', '느껴 보세요'], ['들어 본다', '들어 보세요'],
  ['옮겨 본다', '옮기세요'], ['잡아 본다', '잡으세요'], ['써 본다', '써 보세요'],
  ['떠올려 본다', '떠올리세요'], ['넣어 본다', '넣으세요'], ['지켜 본다', '지키세요'],
  ['좁혀 본다', '좁히세요'], ['가져 본다', '가져 보세요'], ['다뤄 본다', '다뤄 보세요'],
  ['삼아 본다', '삼으세요'], ['받아 본다', '받아 보세요'], ['세워 본다', '세우세요'],
  ['알려 본다', '알리세요'], ['덜어 본다', '덜어 내세요'], ['익혀 본다', '익히세요'],
  ['넓혀 본다', '넓히세요'], ['짚어 본다', '짚으세요'], ['움직여 본다', '움직여 보세요'],
  ['내려놓아 본다', '내려놓으세요'], ['마쳐 본다', '마치세요'], ['이어 본다', '이어 보세요'],
  ['고쳐 본다', '고치세요'], ['돌려 본다', '돌려 보세요'], ['읽어 본다', '읽어 보세요'],
  ['줘 본다', '줘 보세요'], ['되살려 본다', '되살려 보세요'], ['미뤄 본다', '미루세요'],
  ['만나 본다', '만나 보세요'], ['배워 본다', '배워 보세요'], ['밝혀 본다', '밝히세요'],
  ['빼 본다', '빼세요'], ['끝내 본다', '끝내세요'], ['얻어 본다', '얻어 보세요'],
  ['지 않는다', '지 마세요'], ['돌본다', '돌보세요'], ['본다', '보세요'],
  ['준다', '주세요'], ['둔다', '두세요'], ['고른다', '고르세요'],
  ['확인한다', '확인하세요'], ['정리한다', '정리하세요'], ['선택한다', '선택하세요'],
  ['결정한다', '결정하세요'], ['기록한다', '기록하세요'], ['비교한다', '비교하세요'],
  ['나눈다', '나누세요'], ['다룬다', '다루세요'], ['챙긴다', '챙기세요'],
  ['보낸다', '보내세요'], ['쓴다', '쓰세요'], ['고친다', '고치세요'],
  ['넘긴다', '넘기세요'], ['맞춘다', '맞추세요'], ['삼는다', '삼으세요'],
  ['살핀다', '살피세요'], ['바꾼다', '바꾸세요'], ['쉰다', '쉬세요'],
  ['질문한다', '질문하세요'], ['설명한다', '설명하세요'], ['요청한다', '요청하세요'],
  ['시작한다', '시작하세요'], ['준비한다', '준비하세요'], ['구분한다', '구분하세요'],
  ['실천한다', '실천하세요'], ['조정한다', '조정하세요'], ['점검한다', '점검하세요']
];
const END = '(?=[.!?。！？](?:\\s|$)|$)';
const compileEndings = entries => {
  const replacements = new Map(entries);
  const endings = [...replacements.keys()].sort((a, b) => b.length - a.length);
  // A single longest-first pass avoids scanning every sentence once per ending.
  // All replacements end in polite prose, so none needs another ending rule.
  return [[new RegExp('(?:' + endings.join('|') + ')' + END, 'gu'), ending => replacements.get(ending)]];
};
const narrativeEndings = compileEndings(NARRATIVE_ENDINGS);
const instructionEndings = compileEndings(INSTRUCTION_ENDINGS);

function politeProse(plain, action) {
  // Modal and negative verbs are handled before imperative endings. A duty
  // stays a duty, and inability never becomes an instruction to do something.
  let value = plain.replace(/(할까|될까|있을까|없을까|괜찮을까|좋을까|어떨까|맞을까|볼까|갈까|올까|일까)(?=\?$)/gu, '$1요');
  value = value.replace(/([가-힣]+야) 한다(?=[.!?。！？](?:\s|$)|$)/gu, '$1 해요');
  value = value.replace(/못한다(?=[.!?。！？](?:\s|$)|$)/gu, '못해요');
  if (action) value = applyRules(value, instructionEndings);
  value = applyRules(value, narrativeEndings);
  value = value.replace(/([가-힣]+)이다(?=[.!?。！？](?:\s|$)|$)/gu, (_, noun) => {
    const tail = noun.charCodeAt(noun.length - 1);
    return noun + ((tail - 0xac00) % 28 ? '이에요' : '예요');
  });
  // These endings are emitted by the older, reviewed modal rules above.
  return value.replace(/뜻이야(?=[.!?。！？](?:\s|$)|$)/gu, '뜻이에요')
    .replace(/모습이야(?=[.!?。！？](?:\s|$)|$)/gu, '모습이에요')
    .replace(/쉬워(?=[.!?。！？](?:\s|$)|$)/gu, '쉬워요');
}

function revise(text, mode) {
  const value = String(text ?? '');
  // Preserve paragraph separators; only replace reviewed sentence-end phrases.
  return value.split(/(\n+)/u).map(part => {
    if (/^\n+$/u.test(part)) return part;
    return splitSummarySentences(part).map(sentence => {
      if (protectedSentence(sentence) || /(?:예를 들어|가령|가상 장면)/u.test(sentence)) {
        return outsideQuotes(sentence, plain => politeProse(plain, false));
      }
      let editorial = '';
      outsideQuotes(sentence, plain => { editorial += plain; return plain; });
      const conditional = hasCondition(editorial)
        && !/(?:뒤늦게|잘못|성급|무리하게|함부로|덜\s+(?:살필|살펴볼|확인할|비교할|구분할)|놓치|건너뛰)/u.test(editorial);
      return outsideQuotes(sentence, plain => {
        if (mode === 'action') return politeProse(applyRules(plain, actionRules), true);
        const directed = conditional ? applyRules(plain, benefitRules) : plain;
        return politeProse(applyRules(directed, interpretationRules), false);
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
