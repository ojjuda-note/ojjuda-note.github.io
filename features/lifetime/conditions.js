"use strict";

// Maximum-entropy estimates fitted to the exact score totals and five exposure margins in Lee et al., Table 1.
// Bit order: smoking, alcohol, activity, BMI, sleep. Weights are conditional on score (4 and 5 pooled).
const habitPatterns = [
  ["00000", 0, 1.0],
  ["00001", 1, 0.44938236546926],
  ["00010", 1, 0.24939656396425],
  ["00100", 1, 0.16761323299724],
  ["01000", 1, 0.03152065881017],
  ["10000", 1, 0.10208717875907],
  ["00011", 2, 0.31126740322624],
  ["00101", 2, 0.18546649600682],
  ["00110", 2, 0.10967241552447],
  ["01001", 2, 0.05981836435502],
  ["01010", 2, 0.03537255867117],
  ["01100", 2, 0.0210764906429],
  ["10001", 2, 0.1348001243217],
  ["10010", 2, 0.07971172996559],
  ["10100", 2, 0.04749567443981],
  ["11000", 2, 0.01531874284627],
  ["00111", 3, 0.20823915537229],
  ["01011", 3, 0.11727321181075],
  ["01101", 3, 0.06465061152608],
  ["01110", 3, 0.04131139473856],
  ["10011", 3, 0.22544780400853],
  ["10101", 3, 0.12428531777473],
  ["10110", 3, 0.07941765285126],
  ["11001", 3, 0.06999326505289],
  ["11010", 3, 0.04472532174695],
  ["11100", 3, 0.02465626511796],
  ["01111", 4, 0.09872029250451],
  ["10111", 4, 0.25594149908582],
  ["11011", 4, 0.3372943327239],
  ["11101", 4, 0.11243144424131],
  ["11110", 4, 0.11243144424132],
  ["11111", 4, 0.08318098720314]
];

const optionalGroups = {
  basis:{men:"남성",women:"여성"},
  household:{alone:"혼자 살아요",multi:"다른 사람과 함께 살아요"},
  marriage:["결혼한 적 없어요","배우자가 있어요","이혼했어요","배우자와 사별했어요"],
  education:["초등학교 졸업 이하","중학교 졸업","고등학교 졸업","대학교 졸업 이상"],
  smoke:["피운 적 없어요","피우다가 끊었어요","지금도 피워요","지금은 안 피워요"],
  drink:["마신 적 없어요","마시다가 끊었어요","마셔요 · 주당 기준보다 적게","마셔요 · 주당 기준만큼 또는 더 많이","지금도 마셔요","예전 기록 · 주당 기준보다 적게","예전 기록 · 주당 기준만큼 또는 더 많이"],
  exercise:["네, 2시간 30분 이상 해요","아니요, 그보다 적게 해요"],
  bmi:["18.5 미만","18.5 이상 23 미만","23 이상 25 미만","25 이상","18.5 이상 25 미만","18.5 미만 또는 25 이상"],
  sleepBand:["4시간 이하","5~6시간","7~8시간대","9시간 이상","7시간 미만 또는 9시간 이상"],
  history:{no:"없어요",yes:"있어요"},
  mode:{population:"지금 내 나이의 평균으로 계산",trend:"평균수명이 늘어나는 속도로 계산"},
  bonus:{celebrate:"넘긴 시간을 보너스로 보기",current:"지금 내 나이에서 다시 계산하기"}
};

const yesNo={yes:"예",no:"아니요"};
const clockYesNoHabits=[
  ["travel","여행을 좋아하나요?","여행"],
  ["canDrive","운전할 수 있나요?","운전"]
];
const conditionSections = {
  base:[
    ["basis","성별",optionalGroups.basis],
    ["region","어느 지역에 사세요?",Object.fromEntries(Object.keys(population.regions).filter(x=>x!=="전국").map(x=>[x,x]))]
  ],
  daily:[
    ["stressLevel","요즘 스트레스는 어느 정도인가요?",["0 · 전혀 없어요","1","2","3","4","5","6","7","8","9 · 아주 심해요"]],
    ...clockYesNoHabits.map(([key,question])=>[key,question,yesNo]),
    ["folkRemedy","속이 안 좋을 때 어느 쪽 엄지를 바늘로 찌르나요?",{right:"오른쪽",left:"왼쪽",both:"둘 다",neither:"민간요법 믿지 않음"}],
    ["moreScary","귀신과 사람 중 누가 더 무섭나요?",{ghost:"귀신",person:"사람"}]
  ],
  habit:[
    ["smoke","담배를 피우나요?",optionalGroups.smoke],
    ["drink","술을 마시나요?",optionalGroups.drink],
    ["exercise","빠르게 걷는 정도의 운동을 일주일에 2시간 30분 이상 하나요?",optionalGroups.exercise],
    ["sleepBand","하루에 보통 몇 시간 자나요?",optionalGroups.sleepBand],
    ["bmi","검진표에 적힌 BMI",optionalGroups.bmi]
  ],
  social:[
    ["household","누구와 함께 사나요?",optionalGroups.household],
    ["pet","지금 어떤 반려동물과 함께 사나요?",{dog:"강아지",cat:"고양이",other:"다른 동물",mixed:"여러 종류",none:"없어요"},"반려동물과 수명에 관한 연구는 더보기에서 볼 수 있어요."],
    ["marriage","현재 결혼 상태는 어떤가요?",optionalGroups.marriage],
    ["education","어느 학교까지 졸업했나요?",optionalGroups.education]
  ],
  extra:[
    ...["discussionNetwork","socialParticipation","economicActivity","workerType"].map(k=>[k,moreStudies[k].question,moreStudies[k].groups,moreStudies[k].unit]),
    ...["selfHealth","liver"].map(k=>[k,moreStudies[k].question,moreStudies[k].groups]),
    ["activity","가벼운 운동까지 합해 일주일에 얼마나 운동하나요?",["운동하지 않아요","1시간 15분 미만","1시간 15분 이상 2시간 30분 미만","2시간 30분 이상"]],
    ["history","암이나 심장·혈관 질환을 진단받은 적 있나요?",optionalGroups.history],
    ["newdiabetes","최근 제2형 당뇨병을 처음 진단받았나요?",["네, 이번에 처음 진단받았어요"]],
    ["disability","장애인 등록을 하셨나요?",["등록하지 않았어요","등록했어요 · 정도는 모르겠어요","등록했어요 · 경증","등록했어요 · 중증"]],
    ["income","우리 집 소득은 어느 구간인가요?",["1분위 · 가장 낮은 20%","2분위","3분위 · 가운데 20%","4분위","5분위 · 가장 높은 20%"],"건강보험 가입자의 보험료 구간을 아는 경우에 골라요. 의료급여만 받는 경우에는 비워 주세요."]
  ],
  health:[
    ...["missingTeeth","fastingGlucose","cholesterol","hgb","alt"].map(k=>[k,moreStudies[k].question,moreStudies[k].groups,moreStudies[k].unit]),
    ["pressure","누워서 잰 혈압",["위 120 미만이고 아래 80 미만","위 120~139 또는 아래 80~89","위 140~159 또는 아래 90~99","위 160 이상 또는 아래 100 이상"],"두 숫자가 다른 구간이면 더 높은 구간을 골라요."],
    ["glucose","혈액검사의 당화혈색소(%)",["5.0% 미만","5.0% 이상 5.5% 미만","5.5% 이상 6.0% 미만","6.0% 이상 6.5% 미만","6.5% 이상","당뇨병을 진단받았거나 당뇨약을 써요"],"당뇨병을 진단받았다면 마지막 답을 골라요."],
    ["metabolic","검진표의 대사증후군 항목",["5개 중 0~2개에 해당해요","5개 중 3개 이상에 해당해요"],"허리둘레·혈압·혈당·중성지방·HDL 콜레스테롤을 확인해요."],
    ["kidney","콩팥 기능 수치(eGFR)",moreStudies.kidney.groups,"검진표에서 ‘사구체여과율’을 찾아보세요."],
    ["urine","소변검사의 단백뇨",{"0":"음성 또는 미량","1":"1+","2":"2+","3":"3+ 또는 4+",positive:"양성인데 몇 +인지는 몰라요"}],
    ["hearing","청력검사 결과(dB)",moreStudies.hearing.groups,"양쪽 중 더 잘 들리는 귀의 수치를 골라요."],
    ["grip","손으로 쥐는 힘(악력)",["20.25kg 이하","20.375~28.875kg","29~60.25kg"],"양손을 각각 두 번씩 잰 평균이에요."],
    ["diet","식생활 평가 점수(KHEI)",moreStudies.diet.groups,"‘식생활평가지수(KHEI)’ 평가를 받아 본 경우에만 골라요."]
  ]
};
const fieldDefs=Object.values(conditionSections).flat();
const fieldNames=fieldDefs.map(d=>d[0]);

function allowedValue(key,value) {
  const options=fieldDefs.find(d=>d[0]===key)?.[2] ?? optionalGroups[key];
  return typeof value==="string" && value!=="" && options && Object.prototype.propertyIsEnumerable.call(options,value) ? value : "";
}
function cleanConditions(obj={}) {
  return Object.fromEntries([...fieldNames,"mode","bonus"].map(k=>[k,allowedValue(k,obj?.[k])]));
}
function playAdjustment(stories,fields) {
  const stress=Number(fields.stressLevel);
  const yesAnswers=clockYesNoHabits.filter(([key])=>fields[key]==="yes");
  const thumbDays={right:1,left:1,both:2}[fields.folkRemedy]??0;
  const personChosen=fields.moreScary==="person";
  const terms=[];
  if(stories.length) terms.push("이야기 보너스 +"+stories.length+"일");
  if(stress>0) terms.push("스트레스 −"+stress+"일");
  for(const [,,label] of yesAnswers) terms.push(label+" −1일");
  if(thumbDays) terms.push("손 따기 질문 −"+thumbDays+"일");
  if(personChosen) terms.push("귀신과 사람 질문 +1일");
  return {days:stories.length+Number(personChosen)-stress-yesAnswers.length-thumbDays,terms};
}
function habitAnswers(f) {
  const flags=(v,trueValues)=>v===""?null:trueValues.includes(v);
  return [
    flags(f.smoke,["2"]),
    f.drink==="4"?null:flags(f.drink,["3","6"]),
    flags(f.exercise,["1"]),
    flags(f.bmi,["0","3","5"]),
    flags(f.sleepBand,["0","1","3","4"])
  ];
}
function lifestyleRisk(curve,age,sex,flags) {
  const compatible=habitPatterns.filter(([bits])=>flags.every((flag,i)=>flag===null || (bits[i]==="1")===flag));
  const {counts,ratios}=lifestyleStudy[sex];
  const estimate=modeledGroups(curve,age,6,counts,ratios);
  let weight=0,selected=0;
  for(const [,score,prob] of compatible) {
    const n=counts[score]*prob;
    weight+=n;
    selected+=n*estimate.groups[score].risk;
  }
  return {base:estimate.baselineRisk,selected:selected/weight,horizon:6};
}
function conditionEvidence(age,sex,f) {
  const curve=population.national[sex];
  const rows=[], skipped=[],covered=[];
  function use(key,value,extra={}) {
    if(value==="" || value==null) return false;
    const study=moreStudies[key];
    const label=study?.label ?? {household:"가구 형태",marriage:"혼인 상태",education:"학력"}[key];
    const result=comparePopulation(age,sex,{domain:key,studyValue:value,[key]:value,...extra});
    if(!result.applied){skipped.push([label,result.note]);return false;}
    rows.push({key,label,result,url:study?.url});return true;
  }
  const hasIllness=f.history==="yes";
  const network=use("discussionNetwork",f.discussionNetwork);
  if(network && f.socialParticipation!=="") covered.push("모임 참여와 의논 상대는 관계망이 겹쳐 의논 상대 연구를 대표로 사용해요.");
  else use("socialParticipation",f.socialParticipation);
  let worker=false;
  if(f.workerType!=="" && (hasIllness || f.economicActivity==="1")) skipped.push(["일하는 형태","연구는 해당 병력이 없고 일하고 있는 사람을 대상으로 했어요."]);
  else worker=use("workerType",f.workerType);
  if(worker && f.economicActivity!=="") covered.push("경제활동은 입력한 일하는 형태에 포함돼요.");
  else use("economicActivity",f.economicActivity);
  const metricBmi={"0":"low","1":"0","2":"1","3":"2"}[f.bmi]??"";
  let metabolic=false;
  if(f.metabolic!==""){
    if(!metricBmi) skipped.push(["대사증후군","이 조합은 세부 BMI 구간도 필요해요."]);
    else if(hasIllness) skipped.push(["대사증후군","입력한 병력은 연구 제외 조건에 해당해요."]);
    else metabolic=use("metabolic",f.metabolic,{metabolicBmi:metricBmi});
  }
  const flags=habitAnswers(f);
  if(metabolic) flags[3]=null; // The metabolic study already uses BMI.
  const known=flags.filter(v=>v!==null).length;
  const lifestyleOK=age>=19 && age<100 && !hasIllness;
  const directSmoke=["0","1","2"].includes(f.smoke)?f.smoke:"";
  const directDrink={"0":"0","1":"1","2":"2","3":"2","4":"2"}[f.drink]??"";
  let useJoint=known>=2 && lifestyleOK;
  if(known===1 && lifestyleOK){
    // Prefer the precise single-factor study if the reported category and age match it.
    const directAllowed=(flags[0]!==null && directSmoke!=="" && sex!=="all" && age>=40 && age<70)
      ||(flags[1]!==null && directDrink!=="" && age>=20 && !["2","3"].includes(f.drink))
      ||(flags[2]!==null && f.activity!=="" && age>=45)
      ||(flags[4]!==null && f.sleepBand!=="4" && age>=20);
    useJoint=!directAllowed;
  }
  if(useJoint){
    const risk=lifestyleRisk(curve,age,sex,flags);
    rows.push({key:"lifestyle",label:"생활습관 ("+["흡연","음주","운동","체중","수면"].filter((_,i)=>flags[i]!==null).join("·")+")",result:{risk},url:"https://doi.org/10.1038/s41598-020-66742-y"});
  }
  if(useJoint && flags[2]!==null && f.activity!=="") covered.push("주간 총 운동 시간은 생활습관의 운동 항목과 함께 처리해요.");
  if(!useJoint || flags[0]===null) use("smokingOnly",directSmoke);
  if(!useJoint || flags[1]===null) use("alcoholOnly",directDrink);
  if(!useJoint || flags[2]===null) use("activity",f.activity);
  if(!useJoint && f.sleepBand!=="" && f.sleepBand!=="4" && !hasIllness) use("sleep",f.sleepBand);
  if(known && !lifestyleOK) skipped.push(["생활습관 조합",hasIllness?"입력한 병력이 연구의 제외 조건에 해당해요.":"연구의 적용 나이는 만 19~99세예요."]);
  if(f.diet!=="" && hasIllness) skipped.push(["식생활평가지수","연구에서 해당 병력자를 제외했어요."]); else use("diet",f.diet);
  for(const k of ["household","marriage","education","hearing","grip","income","disability"]) use(k,f[k]);
  if(f.kidney!=="" && f.urine!=="") use("kidneyJoint",String(Number(f.kidney)+(f.urine==="0"?0:4)));
  else {
    use("kidney",f.kidney);
    if(f.urine==="positive") skipped.push(["요단백","단독 연구에는 1+ 이상 세부 등급이 필요해요."]);
    else use("urine",f.urine);
  }
  if(metabolic && f.pressure!=="") covered.push("혈압은 대사증후군에 포함돼요.");
  else use("pressure",f.pressure);
  let glycemic=use("newdiabetes",f.newdiabetes);
  if(f.glucose!=="") {
    if(glycemic || metabolic) covered.push("당화혈색소·당뇨 진단은 이미 반영한 혈당 관련 항목과 겹쳐요.");
    else if(hasIllness) skipped.push(["당화혈색소","연구에서 해당 병력자를 제외했어요."]);
    else glycemic=use("glucose",f.glucose);
  }
  if(f.fastingGlucose!=="") {
    if(glycemic || metabolic) covered.push("공복혈당은 이미 반영한 혈당 관련 항목과 겹쳐요.");
    else use("fastingGlucose",f.fastingGlucose);
  }
  const liver=use("liver",f.liver);
  if(liver && f.liver==="1" && f.alt!=="") covered.push("ALT는 입력한 간질환 병력과 겹쳐 별도 배수를 더하지 않아요.");
  else use("alt",f.alt);
  for(const key of ["selfHealth","cholesterol","hgb"]) use(key,f[key]);
  if(hasIllness && f.missingTeeth!=="") skipped.push(["빠진 치아 수","기존 병력과 연구 참여 기준이 겹쳐 제외했어요."]);
  else use("missingTeeth",f.missingTeeth);
  if(f.history!=="") covered.push("암·심혈관질환 병력은 각 연구의 적용 여부를 정하는 데 사용해요.");
  if(f.pet) covered.push("반려동물과 수명의 관계는 연구마다 달라서 시간 보정은 0일이에요.");
  return {rows,skipped,covered};
}
