// Names and cycle metaphors: Wan Minying, Sanming Tonghui, volume 2,
// 「論五行旺相休囚死並寄生十二宫」. Questions are authored by this service.
// This module explains classifications already calculated by reference-data;
// it does not derive strength, favourable elements, events or medical claims.
export const STAGE_SOURCE_URL = 'https://www.shidianguji.com/zh/book/SK1610/chapter/1kf5v6ol1tqg5';

export const STAGE_MEANINGS = Object.freeze({
  长生: { name:'장생', meaning:'처음 생겨서 자라기 시작하는 모습이에요.', question:'처음 배우거나 시작할 일에서 지금 바로 해 볼 첫 단계는 무엇인가요?' },
  沐浴: { name:'목욕', meaning:'막 생겨서 아직 여리고, 조심스럽게 다뤄야 하는 모습이에요.', question:'새로 시작한 일이나 약속 중 서두르지 않고 익숙해져야 할 것은 무엇인가요?' },
  冠带: { name:'관대', meaning:'자라면서 차츰 제 모습을 갖추는 단계예요.', question:'아직 익숙하지 않은 일을 내 방법으로 익히려면 어떤 연습이 필요한가요?' },
  临官: { name:'임관', meaning:'충분히 자라서 자기 역할을 맡는 모습이에요.', question:'지금 맡은 일에서 내가 끝까지 책임질 범위는 어디까지인가요?' },
  帝旺: { name:'제왕', meaning:'한창 자라서 무르익은 모습이에요.', question:'지금 잘하고 있는 일을 꾸준히 이어 가기 위해 꼭 챙길 것은 무엇인가요?' },
  衰: { name:'쇠', meaning:'한창인 때를 지나 조금씩 줄어드는 모습이에요.', question:'이미 해 온 일에서 계속할 것과 줄여도 될 것은 각각 무엇인가요?' },
  病: { name:'병', meaning:'힘이 약해지는 모습을 병에 빗대어 붙인 이름이에요.', question:'맡은 일 중 혼자 하기 어려운 부분은 무엇이고, 누구와 나눌 수 있나요?' },
  死: { name:'사', meaning:'한 과정이 끝나는 모습을 죽음에 빗대어 붙인 이름이에요.', question:'끝낸 일에서 배운 점을 적은 뒤, 다음 일에도 가져갈 것은 무엇인가요?' },
  墓: { name:'묘', meaning:'이룬 것을 거두어 보관하는 모습이에요.', question:'이미 배웠거나 만든 것 중 정리해서 남겨 둘 것은 무엇인가요?' },
  绝: { name:'절', meaning:'새로운 모습이 아직 드러나지 않은 단계예요.', question:'다음 일을 정하기 전에 더 확인하고 싶은 것은 무엇인가요?' },
  胎: { name:'태', meaning:'안에서 새 싹이 생기기 시작하는 모습이에요.', question:'아직 작은 생각을 글이나 그림으로 남긴다면 무엇부터 표현할 건가요?' },
  养: { name:'양', meaning:'안에서 차츰 모양을 갖춰 가는 단계예요.', question:'준비 중인 일을 구체화하려면 지금 무엇부터 채워야 하나요?' },
});

const POSITION_NAMES = { year:'태어난 해 자리', month:'태어난 달 자리', day:'태어난 날 자리', hour:'태어난 시간 자리' };
const CYCLE_REFERENCE = '옛 사주에서는 생겨나고, 자라고, 무르익고, 거두는 모습을 열두 이름으로 나눴어요. 이를 십이운성이라고 해요. 같은 이름의 기본 뜻은 누구에게나 같아요. 여기서는 실제 계산에서 나온 이름을 각 자리에 연결해 설명해요.';
const SOURCE_REFERENCE = '《삼명통회》 권2의 열두 단계 설명을 쉬운 말로 옮겼어요. 원문에서는 ‘생왕’처럼 잘 자라는 이름이어도 무조건 좋다고 정하지 말라고 해요. ‘사·절’처럼 끝을 떠올리게 하는 이름도 무조건 나쁘다고 보지 않아요.';
const QUESTION_REFERENCE = '생활 질문은 이 비유를 이해하도록 오쭈다가 만든 예시예요. 옛 문헌의 문장을 그대로 인용하거나 개인에게 일어날 일을 예측한 내용은 아니에요.';
const STAGE_LIMIT_REFERENCE = '병·사·묘 같은 이름은 변화의 모습을 빗댄 말이에요. 이 이름으로 실제 병, 죽음, 수명이나 성공과 실패를 판정하지 않아요.';

function makeStageChapter(report, fortune, { prefix, id, pillars, period }) {
  if (!pillars?.length) return null;
  const lookup = new Map(report.facts.map(fact => [fact.id, fact]));
  const entries = pillars.map(pillar => {
    const meaning = STAGE_MEANINGS[pillar.lifeStage.hanja];
    if (!meaning) throw new Error('확인되지 않은 십이운성의 뜻을 만들 수 없어요.');
    const factId = `${prefix}.reference.${pillar.pillarKey}.life-stage`;
    if (!lookup.has(factId)) throw new Error('십이운성 풀이에 필요한 계산 근거가 없어요.');
    const position = POSITION_NAMES[pillar.pillarKey] || pillar.pillarLabel;
    return { pillar, meaning, factId, position };
  });
  const factIds = [...new Set(['natal.day-master', 'natal.scope', ...entries.map(entry => entry.factId), ...(prefix === 'natal' ? [] : [`${prefix}.period`])])];
  const calculation = factIds.map(factId => {
    if (!lookup.has(factId)) throw new Error('십이운성 풀이의 적용 범위를 확인할 수 없어요.');
    return lookup.get(factId).text;
  });
  const rules = entries.map(({ pillar, meaning, factId, position }) => ({
    id:`${factId}.meaning`, factIds:['natal.day-master', factId], origin:'traditional-symbolic', sourceUrl:STAGE_SOURCE_URL,
    text:`${position} ${pillar.hangul}(${pillar.hanja}) · ${pillar.lifeStage.label}(${pillar.lifeStage.hanja}): ${meaning.meaning}`,
  }));
  const uniqueEntries = [...new Map(entries.map(entry => [entry.pillar.lifeStage.hanja, entry])).values()];
  const summary = prefix === 'natal'
    ? `확인된 ${entries.length}자리에서 ${uniqueEntries.map(entry => entry.pillar.lifeStage.label).join('·')}의 뜻을 읽어요.`
    : `${period}의 계산 결과는 ‘${entries[0].pillar.lifeStage.label}’ 단계예요. ${entries[0].meaning.meaning}`;
  const master = fortune.profile.dayMaster;
  const interpretation = rules.map(rule => rule.text);
  const positionReference = prefix === 'natal'
    ? `나를 나타내는 글자(${master.hangul}·${master.hanja})와 각 자리의 아래쪽 글자를 비교했어요. 여기서 해·달·날·시간은 태어난 사주의 자리 이름이에요. 어린 시절부터 노년까지를 순서대로 나눈 표가 아니에요.`
    : `나를 나타내는 글자(${master.hangul}·${master.hanja})와 ${period}의 아래쪽 글자를 비교했어요. 같은 해나 달이어도 나를 나타내는 글자가 다르면 결과의 이름도 달라질 수 있어요.`;
  const easyParagraphs = [
    ...(prefix === 'natal' ? ['자라고 거두는 모습을 빗대어 열두 단계의 이름을 붙였어요. 이 분류를 십이운성이라고 해요.'] : []),
    prefix === 'natal'
      ? `내 기준 글자(${master.hangul}·${master.hanja})와 각 자리의 아래쪽 글자를 비교했어요.`
      : `내 기준 글자(${master.hangul}·${master.hanja})와 ${period}의 아래쪽 글자를 비교했어요.`,
    ...interpretation,
    ...(entries.some(entry => ['病','死','墓'].includes(entry.pillar.lifeStage.hanja))
      ? ['병·사·묘는 변화의 비유이며 실제 질병이나 죽음을 뜻하지 않아요.'] : []),
  ];
  return {
    id, title:'자라고 쉬는 열두 단계의 뜻', summary, easyParagraphs, factIds,
    calculation, interpretation, rules, referenceRules:[],
    reference:[CYCLE_REFERENCE, positionReference, SOURCE_REFERENCE, STAGE_LIMIT_REFERENCE, QUESTION_REFERENCE, `원문을 확인한 곳: ${STAGE_SOURCE_URL}`],
    practice:uniqueEntries.map(({ meaning }) => `${meaning.name}: ${meaning.question}`),
    paragraphs:[...calculation, ...interpretation], basis:calculation,
  };
}

/** Append explanatory chapters without adding, replacing or recounting facts. */
export function attachStageReadings(report, fortune) {
  const natal = makeStageChapter(report, fortune, { prefix:'natal', id:'life-stage-meanings', pillars:fortune.profile.reference?.pillars });
  if (natal) report.sections.find(section => section.id === 'lifelong').chapters.push(natal);
  const annual = makeStageChapter(report, fortune, { prefix:'annual', id:'annual-stage-meaning', pillars:fortune.annual.reference?.pillars, period:`${fortune.year}년` });
  if (annual) report.sections.find(section => section.id === 'annual').chapters.push(annual);
  for (const month of report.months) {
    const transit = fortune.months.find(value => value.month === month.month);
    const chapter = makeStageChapter(report, fortune, { prefix:`month.${month.month}`, id:'month-stage-meaning', pillars:transit?.reference?.pillars, period:`${fortune.year}년 ${month.month}월` });
    if (chapter) month.chapters.push(chapter);
  }
  return report;
}
