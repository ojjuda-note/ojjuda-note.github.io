"use strict";

// KNHANES, Lee et al. (2020), tables 1 and 3. The last group has four or five factors.
const lifestyleStudy = {
  men: { counts:[2015,5040,5096,2764,912], ratios:[1,1.48,1.34,1.88,2.03] },
  women: { counts:[4897,9046,5855,1665,182], ratios:[1,1.10,1.03,1.47,3.30] }
};
// 2024 census, approximate share living alone among Korean nationals aged 40–49/50–59/60–69.
const householdShare = { men:[629/3803,713/4242,664/3740], women:[360/3670,505/4211,750/3878] };
const moreStudies={
  ...independentStudies,
  ...additionalStudies,
  ...socialFactors,
  metabolic:{label:"대사증후군 · 검진 기준",ageMin:40,horizonYears:9.7,unit:"다섯 항목 중 해당 개수를 골라요. 허리둘레(남 90·여 85cm 이상), 혈압 130/85 이상(둘 중 하나), 공복혈당 100 이상, 중성지방 150 이상, HDL 남 40·여 50 미만(mg/dL). 혈압약·당뇨약·지질강하제 복용은 각각 혈압·혈당·중성지방에 포함해요.",groups:["0~2개 해당","3~5개 해당"],eligibility:"심장·뇌혈관질환, 말초동맥질환, 심방세동·심부전, 간경변, 말기 신장질환·투석, 암 병력이 없음",cohort:"한국 건강보험 검진자 151,706명, 40세 이상. 체질량과 대사 상태를 함께 비교한 관찰 연구로, 체중 변화의 효과를 측정한 값은 아니에요.",url:"https://pmc.ncbi.nlm.nih.gov/articles/PMC9837041/"},
  newdiabetes:{label:"현재 제2형 당뇨 신규 진단",ageMin:30,ageMax:84,unit:"진단 시점의 기대여명을 연구한 한국 자료예요.",groups:["현재 새로 진단받음"],cohort:"2008년 신규 진단자와 같은 성별·연령대 일반 인구의 기대여명 차이를 오늘 생명표에 적용했어요. 기존 당뇨 병력 비교에는 당화혈색소·당뇨 진단을 선택해요.",url:"https://doi.org/10.3346/jkms.2019.34.e74"},
  disability:{label:"등록 장애",ageMin:0,ageMax:85,unit:"한국 장애등록 기준이에요. 결과는 2014~2018년 전국 연구를 기준으로 보여줘요.",groups:["미등록","등록 · 정도 구분 없이","등록 · 경증","등록 · 중증"],cohort:"국립재활원 2014~2018년 연구 표 2. 성별·연령별로 선택 집단의 당시 기대여명을 그대로 사용하고 중간 나이는 보간해요. 연구의 비교군은 미등록 집단이에요.",url:socialStudies.disability.source},
  income:{label:"가구 소득분위",ageMin:0,unit:"건강보험 가입자의 보험료 구간을 두 개씩 묶어 5분위로 비교해요.",groups:["1분위 · 하위 20%","2분위","3분위","4분위","5분위 · 상위 20%"],cohort:"한국보건사회연구원 연구보고서 2024-44 부표 1. 건강보험 가입자의 연간 사망 오즈를 전국 생명표에 맞춰 첫 1년에 적용해요.",url:"https://www.kihasa.re.kr/api/kihasa/file/download?seq=29368"}
};
const metabolicModel={
  men:{counts:[23944,18344,14498,4046,7424,16993],ratios:[1,.83,.74,1.20,.95,.86]},
  women:{counts:[20878,12850,10784,4244,5313,12388],ratios:[1,.86,.93,1.32,1.14,1.02]}
};
const diabetesGap={men:[3.7,3.3,3.1,2.8,2.4,2,1.8,1.6,1.5,1.1,.8],women:[3.2,3,2.7,2.4,2.3,2,1.7,1.5,1.2,.8,.5]};

function tableValue(curve, age, column) {
  const last = curve[curve.length - 1];
  if (age >= last[0]) {
    return column === 2 ? last[2] : last[1] * Math.exp(-(age - last[0]) / last[2]);
  }
  const right = curve.findIndex(knot => knot[0] > age);
  const a = curve[Math.max(0, right - 1)], b = curve[right];
  if (a === b) return a[column];
  const fraction = (age - a[0]) / (b[0] - a[0]);
  return a[column] + fraction * (b[column] - a[column]);
}

// Find the reference survival whose stratum-weighted survival reproduces the official curve.
function referenceSurvival(survival, counts, ratios) {
  if (survival >= 1) return 1;
  const total = counts.reduce((sum,value)=>sum+value,0);
  let low=0, high=1;
  for (let i=0;i<45;i++) {
    const middle=(low+high)/2;
    const mixture=ratios.reduce((sum,r,j)=>sum + counts[j]/total * Math.pow(middle,r),0);
    if (mixture<survival) low=middle;
    else high=middle;
  }
  return (low+high)/2;
}

function survivorCount(curve,age) {
  const next=curve.findIndex(row=>row[0]>age);
  const start=next<0?curve[curve.length-1]:curve[next-1];
  return start[1]*Math.exp(-hazardAt(curve,age)*(age-start[0]));
}
function modeledGroups(curve,age,horizon,counts,ratios) {
  const survival=survivorCount(curve,age+horizon)/survivorCount(curve,age);
  const reference=referenceSurvival(survival,counts,ratios);
  return {baselineRisk:1-survival,horizon,groups:ratios.map(r=>({risk:1-Math.pow(reference,r)}))};
}
function studyGap(type,sex,age,category) {
  const [start,spacing]=type==="marriage"?[25,10]:[40,5];
  const groups=population[type][sex], peers=population.contemporary[type][sex];
  const position=(age-start)/spacing;
  const lower=Math.floor(position), upper=Math.min(lower+1,groups.length-1);
  const gap=i=>groups[i][category]-peers[i];
  return gap(lower)+(position-lower)*(gap(upper)-gap(lower));
}

function comparePopulation(age,sex,form) {
  const curve=population.national[sex],base=tableValue(curve,age,2);
  const result={applied:false,note:""};
  const study=moreStudies[form.domain];
  if(study) {
    const key=form.domain, sKey={men:"male",women:"female",all:"overall"}[sex];
    const max=study.ageMax??99;
    if(age<study.ageMin || (key!=="income" && (key==="disability"?age>max:Math.floor(age)>max))) return {...result,note:"연구의 적용 연령은 "+study.ageMin+"~"+max+"세예요."};
    if(form.studyValue==="" || form.studyValue==null) return {...result,note:"비교할 집단을 선택해 주세요."};
    const index=Number(form.studyValue);
    if(key==="income"){
      return {...result,applied:true,risk:incomeRisk(curve,age,index)};
    }
    if(key==="disability"){
      const row=socialStudies.disability[sKey], pos=age/5, i=Math.floor(pos),j=Math.min(i+1,row.length-1);
      const val=k=>row[i][k]+(pos-i)*(row[j][k]-row[i][k]);
      const peers=tableValue(disabilityPeers[sex],age,1);
      return {...result,applied:true,years:base+val(index+1)-peers};
    }
    if(key==="newdiabetes") return {...result,applied:true,years:base-diabetesGap[sex][Math.floor((age-30)/5)],note:"한국 연구의 연령·성별 신규 진단 집단과 전체 인구의 기대여명 차이를 반영했어요."};
    let counts,ratios,group=index;
    if(key==="metabolic") {
      if(form.metabolicBmi==="" || form.metabolicBmi==="low") return {...result,note:"이 연구는 BMI 18.5 이상에서 체중과 대사 상태를 함께 비교해요."};
      ({counts,ratios}=metabolicModel[sex]); group=3*index+Number(form.metabolicBmi);
    } else {
      counts=study.weightedPopulationCounts??study.counts[sex]??study.counts.all;ratios=study.ratiosBySex?.[sex]??study.hr;
      if(key==="activity") {
        // KLoSA's first nonzero estimate (1.03, CI 0.77–1.40) is uncertain.
        // Interpolate the clock's 37.5-min level between 0 and 112.5 min.
        ratios=[ratios[0],ratios[0]+(ratios[2]-ratios[0])/3,...ratios.slice(2)];
      }
    }
    const estimate=modeledGroups(curve,age,study.horizonYears,counts,ratios), selected=estimate.groups[group];
    return {...result,applied:true,risk:{base:estimate.baselineRisk,selected:selected.risk,horizon:estimate.horizon},note:"선택한 집단의 사망위험 차이를 처음 "+study.horizonYears+"년간 반영했어요."};
  }
  if(form.domain==="household") {
    if(age<40 || age>=70) return {...result,note:"가구 형태 연구는 만 40~69세를 대상으로 했어요."};
    if(form.household==="") return {...result,note:"현재 누구와 사는지 선택해 주세요."};
    const p=householdShare[sex][Math.floor((age-40)/10)];
    const horizon=Math.min(6,70-age);
    const estimate=modeledGroups(curve,age,horizon,[1-p,p],[1,1.25]);
    const group=estimate.groups[form.household==="alone"?1:0];
    return {...result,applied:true,risk:{base:estimate.baselineRisk,selected:group.risk,horizon},note:"같은 성별·연령대의 1인 가구 거주 비율 약 "+(100*p).toFixed(1)+"%로 보정했어요."};
  }
  const isMarriage=form.domain==="marriage", [min,max]=isMarriage?[25,75]:[40,85];
  if(age<min || age>max) return {...result,note:"이 표에서 비교할 수 있는 나이는 만 "+min+"세부터 정확히 "+max+"세까지예요."};
  const category=form[form.domain];
  if(category==="") return {...result,note:isMarriage?"현재 혼인 상태를 선택해 주세요.":"학력을 선택해 주세요."};
  const difference=studyGap(form.domain,sex,age,Number(category));
  return {...result,years:Math.max(0,base+difference),applied:true,note:"2010년에 관찰된 집단 간 기대여명 차이가 지금도 같다고 가정한 값이에요."};
}
