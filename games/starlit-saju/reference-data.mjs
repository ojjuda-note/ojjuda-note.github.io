// Reference tables extracted without reordering from lunar-javascript 1.7.8.
// Source: 6tail/lunar-javascript, commit 5c92e62c904ba5cc0b62f032796aeef433702268.
// MIT license: vendor/lunar-LICENSE.txt. No birth-time/calendar rules are changed.
const ZHI_HIDE_GAN = {"子":["癸"],"丑":["己","癸","辛"],"寅":["甲","丙","戊"],"卯":["乙"],"辰":["戊","乙","癸"],"巳":["丙","庚","戊"],"午":["丁","己"],"未":["己","丁","乙"],"申":["庚","壬","戊"],"酉":["辛"],"戌":["戊","辛","丁"],"亥":["壬","甲"]};
const CHANG_SHENG_OFFSET = {"甲":1,"丙":10,"戊":10,"庚":7,"壬":4,"乙":6,"丁":9,"己":9,"辛":0,"癸":3};
const CHANG_SHENG = ["长生","沐浴","冠带","临官","帝旺","衰","病","死","墓","绝","胎","养"];
const NAYIN = {"甲子":"海中金","甲午":"沙中金","丙寅":"炉中火","丙申":"山下火","戊辰":"大林木","戊戌":"平地木","庚午":"路旁土","庚子":"壁上土","壬申":"剑锋金","壬寅":"金箔金","甲戌":"山头火","甲辰":"覆灯火","丙子":"涧下水","丙午":"天河水","戊寅":"城头土","戊申":"大驿土","庚辰":"白蜡金","庚戌":"钗钏金","壬午":"杨柳木","壬子":"桑柘木","甲申":"泉中水","甲寅":"大溪水","丙戌":"屋上土","丙辰":"沙中土","戊子":"霹雳火","戊午":"天上火","庚寅":"松柏木","庚申":"石榴木","壬辰":"长流水","壬戌":"大海水","乙丑":"海中金","乙未":"沙中金","丁卯":"炉中火","丁酉":"山下火","己巳":"大林木","己亥":"平地木","辛未":"路旁土","辛丑":"壁上土","癸酉":"剑锋金","癸卯":"金箔金","乙亥":"山头火","乙巳":"覆灯火","丁丑":"涧下水","丁未":"天河水","己卯":"城头土","己酉":"大驿土","辛巳":"白蜡金","辛亥":"钗钏金","癸未":"杨柳木","癸丑":"桑柘木","乙酉":"泉中水","乙卯":"大溪水","丁亥":"屋上土","丁巳":"沙中土","己丑":"霹雳火","己未":"天上火","辛卯":"松柏木","辛酉":"石榴木","癸巳":"长流水","癸亥":"大海水"};
const XUN = ["甲子","甲戌","甲申","甲午","甲辰","甲寅"];
const XUN_KONG = ["戌亥","申酉","午未","辰巳","寅卯","子丑"];

const STEM_HANJA = '甲乙丙丁戊己庚辛壬癸';
const BRANCH_HANJA = '子丑寅卯辰巳午未申酉戌亥';
const CHAR_KOREAN = Object.fromEntries([...STEM_HANJA + BRANCH_HANJA].map((value,index) =>
  [value,[...'갑을병정무기경신임계자축인묘진사오미신유술해'][index]]));
const STAGE_KOREAN = ['장생','목욕','관대','임관','제왕','쇠','병','사','묘','절','태','양'];
const korean = value => [...value].map(character => CHAR_KOREAN[character]).join('');

/** Supplementary classifications use only already confirmed pillars.
 * Hidden stems are not added to the surface-element or principal-stem counts. */
export function makeReference(profile, readStem, readGod) {
  const dayIndex = STEM_HANJA.indexOf(profile.dayMaster.hanja);
  return {
    source: {
      name:'lunar-javascript',version:'1.7.8',
      url:'https://6tail.cn/calendar/lunar.bazi.html',
      revision:'5c92e62c904ba5cc0b62f032796aeef433702268',
    },
    pillars:profile.knownPillars.map(pillar => {
      const branchIndex = BRANCH_HANJA.indexOf(pillar.branch.hanja);
      const stageIndex = (CHANG_SHENG_OFFSET[profile.dayMaster.hanja] + (dayIndex % 2 ? -branchIndex : branchIndex) + 12) % 12;
      const difference = (STEM_HANJA.indexOf(pillar.stem.hanja) - branchIndex + 12) % 12;
      const xunIndex = Math.floor(difference / 2);
      return {
        pillarKey:pillar.key,pillarLabel:pillar.label,hanja:pillar.hanja,hangul:pillar.hangul,
        hiddenStems:ZHI_HIDE_GAN[pillar.branch.hanja].map((value,index) => ({
          order:index+1,isMain:index===0,stem:readStem(value),god:readGod(profile.dayMaster,value),
        })),
        lifeStage:{hanja:CHANG_SHENG[stageIndex],hangul:STAGE_KOREAN[stageIndex],
          label:stageIndex===3?'임관(건록)':STAGE_KOREAN[stageIndex]},
        nayin:{hanja:NAYIN[pillar.hanja]},
        xun:{hanja:XUN[xunIndex],hangul:korean(XUN[xunIndex])},
        xunKong:{hanja:XUN_KONG[xunIndex],hangul:korean(XUN_KONG[xunIndex])},
      };
    }),
    notes:[
      '이 표는 확정된 각 주에 붙는 전통 분류 자료예요. 길흉이나 실제 사건의 발생을 판정한 결과가 아니에요.',
      '지장간은 고정한 라이브러리가 제공하는 전체 목록과 순서를 그대로 표시해요. 첫 글자는 본기이고 이후 글자는 자료 순서만 표시하며, 학파마다 세부 구분과 해석이 다를 수 있어요.',
      '전체 지장간과 그 십성은 별도 참고 자료이며, 위의 원국 오행·음양 개수나 천간·지지 본기 십성 집계에 다시 합산하지 않아요.',
      '십이운성은 확정된 일간과 각 주의 지지로 조회한 분류예요. 병·사·묘 등의 명칭은 의학적 질병·사망·수명 예측을 뜻하지 않아요.',
      '납음은 각 간지의 전통 명칭을 원자료 한자로 표시해요. 원국 글자의 오행을 바꾸거나 별도 오행 수에 더하지 않아요.',
      '순과 공망은 각 주의 간지가 속한 10간지 묶음과 그 묶음에 없는 두 지지예요. 일주 기준으로 다른 주의 공망 해당 여부나 그 효력을 판정하지 않아요.',
    ],
  };
}

/** The year/month pair is classified against the confirmed BIRTH day stem.
 * This does not replace a birth pillar or add hidden stems to existing counts. */
export function makeTransitReference(profile, transit, { scope, key, label }, readStem, readGod) {
  if (!['annual', 'monthly'].includes(scope)) throw new TypeError('Unknown period-reference scope.');
  const reference = makeReference({
    dayMaster: profile.dayMaster,
    knownPillars: [{ ...transit, key, label }],
  }, readStem, readGod);
  return {
    scope,
    dayMaster: { ...profile.dayMaster },
    source: reference.source,
    pillars: reference.pillars,
    notes: [
      '이 표는 선택한 해나 달의 두 글자를 따로 살펴보는 자료예요. 태어난 때의 사주에 이 글자가 있다고 더하지 않아요.',
      '안쪽에 연결된 글자(지장간)는 원래 자료의 목록과 순서를 모두 남겨요. 첫 글자만 대표 글자(본기)로 표시하며, 나머지 글자의 힘이나 비중을 임의로 정하지 않아요.',
      '지장간의 십성과 십이운성은 태어난 날의 위쪽 글자(일간)를 기준으로 읽어요. 이 해나 달의 위쪽 글자를 나 대신 기준으로 삼지 않아요.',
      '안쪽 글자들은 별도 참고 자료예요. 태어난 사주의 오행·음양 개수나 주요 십성 개수에 다시 더하지 않으며, 해·달의 대표 글자 풀이를 바꾸지 않아요.',
      '십이운성의 병·사·묘 같은 이름은 옛 분류 이름이에요. 실제 질병·죽음·수명을 뜻한다고 읽지 않아요.',
      '납음은 이 해나 달의 두 글자에 붙은 원래 이름이에요. 글자의 오행을 바꾸거나 새로운 오행 수로 더하지 않아요.',
      '순·공망은 이 해나 달의 글자 조합이 속한 열 개짜리 묶음과 그 안에 없는 두 글자를 표시해요. 내 사주에 공망이 작용하는지나 어떤 사건이 생길지는 판단하지 않아요.',
      ...(!profile.complete ? ['태어난 사주에서 확정하지 못한 글자는 채워 넣지 않았어요. 이 참고표에는 확인된 일간만 기준으로 사용했어요.'] : []),
    ],
  };
}
