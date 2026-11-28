"use strict";

const KST = 9 * 3600 * 1000;
const DAY = 86400;
const groups = {
  men: {name: "남성", start: 79.0, end: 80.8},
  women: {name: "여성", start: 85.2, end: 86.6},
  all: {name: "전체", start: 82.1, end: 83.7}
};

function midnight(year, month, day) {
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return utc.getTime() - KST;
}
function parts(time) {
  const date = new Date(time + KST);
  return {year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate()};
}
function isoDate(time) {
  return new Date(time + KST).toISOString().slice(0, 10);
}
function birthParts(value, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const time = midnight(year, month, day);
  if (!year || time > now || isoDate(time) !== value) return null;
  return {year, month, day};
}
function birthTimeOffset(value) {
  if(value==null || value==="") return 0;
  if(typeof value!=="string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [h,m]=value.split(":").map(Number);
  return (60*h+m)*60000;
}
function birthMoment(date,time,now) {
  const birth=birthParts(date,now);
  if(!birth) return null;
  const offset=birthTimeOffset(time);
  const timestamp=midnight(birth.year,birth.month,birth.day)+offset;
  return Number.isFinite(timestamp) && timestamp<=now ? {...birth,offset,timestamp} : null;
}
// Preserve the original day in each month, clamping only when that month is shorter.
function anniversary(birth, months) {
  const month = birth.month + months;
  const lastDay = parts(midnight(birth.year, month + 1, 0)).day;
  return midnight(birth.year, month, Math.min(birth.day, lastDay))+(birth.offset??0);
}
function calendarMonths(birth, time) {
  const today = parts(time);
  let months = 12 * (today.year - birth.year) + today.month - birth.month;
  if (anniversary(birth, months) > time) months--;
  const start = anniversary(birth, months);
  const end = anniversary(birth, months + 1);
  return months + (time - start) / (end - start);
}
function trendTarget(birth,sex,shift=0) {
  const group=groups[sex];
  const gain=(group.end-group.start)/(2024-2015);
  const meeting=(group.end+shift+gain*(birth.year-2024))/(1-gain);
  // Keep the earliest observed level for crossings before the observation window.
  const years=Math.max(group.start+shift,meeting);
  const months=years*12, whole=Math.floor(months);
  const start=anniversary(birth,whole),end=anniversary(birth,whole+1);
  return Math.round((start+(months-whole)*(end-start))/1000)*1000;
}

const YEAR_MS=365.2425*DAY*1000;
const byId=id=>document.getElementById(id);
const birthInput=byId("birth"),birthTimeInput=byId("birth-time");
const dialog=byId("condition-dialog");
const form=byId("condition-form");
const storageKey="life-clock-settings-v3";
let timer,clock=null;
function put(id,value) {
  const el=byId(id);
  if(el.textContent!==value) el.textContent=value;
}
function timeText(seconds) {
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,"0")).join(":");
}
function calendarRemainder(target,now) {
  // Count months from the fixed finish line so shorter months cannot reverse the countdown.
  const anchor=parts(target),current=parts(now);
  anchor.offset=target-midnight(anchor.year,anchor.month,anchor.day);
  if(anchor.day===parts(midnight(anchor.year,anchor.month+1,0)).day) anchor.day=31;
  const direction=now<target?-1:1;
  let months=Math.abs((current.year-anchor.year)*12+current.month-anchor.month);
  let edge=anniversary(anchor,direction*months);
  if(direction*(now-edge)<0){
    months--;
    edge=anniversary(anchor,direction*months);
  }
  const rest=Math.floor(Math.abs(now-edge)/1000);
  return {years:Math.floor(months/12),months:months%12,days:Math.floor(rest/DAY),seconds:rest%DAY};
}
const hourlyCheers=[
  "첫걸음은 작아도 좋아요. 이제 당신의 시간이 시작돼요.",
  "별이 드문 밤에도 길은 이어져요.",
  "잠시 눈을 감고, 오늘 애쓴 나를 다독여 주세요.",
  "아직 어둡다면 천천히 걸어도 괜찮아요.",
  "모두 잠든 사이에도, 당신만의 아침이 오고 있어요.",
  "동이 트네요. 오늘은 어떤 빛을 만날까요?",
  "기지개 한 번 켜고, 당신의 속도로 출발해요.",
  "오늘 하고 싶은 일 하나를 마음에 올려 보세요.",
  "서툰 첫 시도에도 응원을 보낼게요.",
  "누군가보다 빠를 필요 없어요. 내 걸음이면 충분해요.",
  "여기까지 걸어온 자신에게 고맙다고 말해 주세요.",
  "바쁜 와중에도 좋아하는 것 하나쯤 챙겨요.",
  "한낮이네요. 잠깐 쉬어 갈 자리는 당신 몫이에요.",
  "오후의 첫걸음은 가벼워도 좋아요.",
  "익숙한 하루에도 새로 해 볼 일이 하나쯤 있어요.",
  "숨을 고르고 다시 시작해도 좋은 시간이에요.",
  "햇살이 기울어도 당신에게 어울리는 빛은 남아 있어요.",
  "오늘 해낸 작은 일 하나를 기억해 주세요.",
  "하늘빛이 달라지네요. 잠시 올려다볼까요?",
  "저녁 바람처럼 편안한 순간이 곁에 머물길 바라요.",
  "소중한 사람에게 건네는 한마디처럼, 나에게도 다정하게.",
  "이제 어깨에 힘을 풀어도 괜찮아요.",
  "오늘 가장 좋았던 순간 하나를 별처럼 간직해요.",
  "별빛 아래, 당신이 걸어온 길에 박수를 보내요."
];
const bonusLines=[
  "운명과 싸워 이겨내셨군요. 이제 연장전입니다!",
  "운명도 두 손 들었네요. 이번 판은 당신의 승리!",
  "운명이 마침표를 찍으려다 말줄임표로 고쳤네요…",
  "운명이 시계를 봤고, 당신은 다음 장을 펼쳤습니다.",
  "인생 시계가 한 바퀴 돌았어요. 이제 연장전!",
  "시계는 자정, 내 이야기는 다음 장!",
  "오늘도 내 속도로, 보너스 라운드 진행 중!",
  "하루를 꽉 채웠어요. 앙코르가 시작됐어요!"
];
function tick() {
  clearTimeout(timer);
  if(!clock || document.hidden) return;
  const now=Math.floor(Date.now()/1000)*1000;
  const elapsed=Math.max(0,(now-clock.born)/1000);
  const span=(clock.target-clock.born)/1000;
  const lifeSeconds=(elapsed*DAY)/span;
  drawLifeDial(lifeSeconds,timeText(Math.floor(lifeSeconds)));
  const inBonus=now>=clock.target;
  const bonusDay=Math.floor((now+KST)/(DAY*1000))-Math.floor((clock.target+KST)/(DAY*1000));
  put("encouragement",inBonus?bonusLines[bonusDay%bonusLines.length]:hourlyCheers[Math.floor(lifeSeconds/3600)]);
  put("remaining-label",inBonus?(clock.play?"재미 시계의 연장전":"쌓인 보너스 시간"):(clock.play?"남은 시간":"남은 추정 수명"));
  const left=calendarRemainder(clock.target,now);
  drawFlipBoard(left,clock,now);
  put("remaining",left.years+"년 "+left.months+"개월 "+left.days+"일 "+timeText(left.seconds));
  timer=setTimeout(tick,1000-Date.now()%1000);
}

const blankAnswer="건너뛰기";
const historicalChoices={smoke:["3"],drink:["5","6"],sleepBand:["4"],bmi:["4","5"]};

function addHint(field,control,message) {
  const note=document.createElement("small");
  note.id=control.id+"-hint";note.textContent=message;
  control.setAttribute("aria-describedby",note.id);field.append(note);
}

function addDetails(field,title,message) {
  const info=document.createElement("details"), heading=document.createElement("summary"), note=document.createElement("small");
  info.className="study-scope";heading.textContent=title;note.textContent=message;
  info.append(heading,note);field.append(info);
}

function addBMIField(container,field,select) {
  const group=document.createElement("fieldset"), legend=document.createElement("legend"), pair=document.createElement("div");
  group.className="body-size";legend.textContent="키와 몸무게";pair.className="measurement-pair";
  for(const [id,label] of [["height","키 (cm)"],["weight","몸무게 (kg)"]]) {
    const wrap=document.createElement("div"),caption=document.createElement("label"),input=document.createElement("input");
    wrap.className="field";caption.htmlFor=id;caption.textContent=label;
    input.id=id;input.type="number";input.inputMode="decimal";input.min="0.01";input.step="any";
    input.addEventListener("input",syncBodySize);
    wrap.append(caption,input);pair.append(wrap);
  }
  const direct=document.createElement("details"), summary=document.createElement("summary"), feedback=document.createElement("small");
  direct.className="study-scope";direct.id="bmi-direct";summary.textContent="BMI를 직접 고를게요";
  feedback.id="size-feedback";feedback.setAttribute("aria-live","polite");
  direct.append(summary,field);group.append(legend,pair,feedback,direct);container.append(group);
  select.addEventListener("change",()=>{
    byId("height").value="";byId("weight").value="";feedback.textContent="";
  });
}

function measuredBmiBand(height,weight) {
  if(!Number.isFinite(height) || !Number.isFinite(weight) || height<=0 || weight<=0) return "";
  const bmi=(weight/height)*(10000/height);
  // Decimal measurements at a cutoff can land a few floating-point units below it.
  const corrected=bmi+4*Number.EPSILON*bmi;
  return corrected<18.5?"0":corrected<23?"1":corrected<25?"2":"3";
}

function syncBodySize() {
  const height=byId("height").valueAsNumber,weight=byId("weight").valueAsNumber,select=byId("input-bmi");
  select.value=measuredBmiBand(height,weight);
  let message="";
  if(select.value!=="") message="키와 몸무게로 계산해요.";
  else if(height>0 || weight>0) message=height>0?"몸무게도 넣으면 계산에 반영돼요.":"키도 넣으면 계산에 반영돼요.";
  byId("size-feedback").textContent=message;
}

function addDrinkAmount(field) {
  const wrap=document.createElement("div"),caption=document.createElement("label"),select=document.createElement("select");
  wrap.className="field drink-amount";wrap.id="drink-amount-field";wrap.hidden=true;
  caption.htmlFor="drink-amount";caption.textContent="지난 1년 동안 일주일에 보통 몇 잔 마셨나요?";
  select.id=caption.htmlFor;select.add(new Option(blankAnswer,""));
  select.add(new Option("","2"));select.add(new Option("","3"));
  wrap.append(caption,select);field.append(wrap);
  byId("input-basis").addEventListener("change",()=>{select.value="";refreshDrinkAmount();});
  field.querySelector("#input-drink").addEventListener("change",()=>{select.value="";refreshDrinkAmount();});
}

function refreshDrinkAmount() {
  const sex=byId("input-basis").value, amount=byId("drink-amount");
  const limit=sex==="men"?14:sex==="women"?10:null;
  amount.options[1].text=limit?limit+"잔 미만":"남성은 14잔 미만, 여성은 10잔 미만";
  amount.options[2].text=limit?limit+"잔 이상":"남성은 14잔 이상, 여성은 10잔 이상";
  byId("drink-amount-field").hidden=byId("input-drink").value!=="4";
}

// One symbolic day per selected story. These are game choices, never mortality factors.
const clockStories={
  lateDate:"나이 들어서도 연애하고 싶나요?",
  summitLunch:"산에 가는 걸 좋아하나요?",
  oldFriends:"오래 만나고 싶은 친구가 있나요?",
  dogCoach:"반려동물과 산책하는 편인가요?",
  longMenu:"가 보고 싶은 맛집이 많나요?",
  longLaugh:"힘든 일도 웃어넘기는 편인가요?",
  nextBloom:"식물 가꾸기를 좋아하나요?",
  titleYear:"꾸준히 응원하는 팀이 있나요?"
};
const previousStoryKeys=["romance","mountain","microwave","tangerine","rain","cat","elevator","book"];
function knownStories(value) {
  if(!Array.isArray(value)) return [];
  return [...Object.keys(clockStories),...previousStoryKeys].filter(key=>value.includes(key));
}
function buildEditor() {
  const stories=byId("play-questions");
  for(const [key,question] of Object.entries(clockStories)){
    const label=document.createElement("label"),check=document.createElement("input");
    check.type="checkbox";check.id="story-"+key;
    const title=document.createElement("span");title.textContent=question;
    label.append(check,title);stories.append(label);
  }
  for(const [section,definitions] of Object.entries(conditionSections)) {
    const container=byId(section+"-fields");
    for(const [key,label,choices,hint] of definitions) {
      const field=document.createElement("div"),caption=document.createElement("label"),select=document.createElement("select");
      field.className="field";select.id="input-"+key;caption.htmlFor=select.id;caption.textContent=label;
      select.add(new Option(blankAnswer,""));
      for(const [value,text] of Object.entries(choices)) {
        if(key==="drink" && ["2","3"].includes(value)) continue;
        select.add(new Option(text,value));
      }
      field.append(caption,select);
      if(key==="bmi") {addBMIField(container,field,select);continue;}
      container.append(field);
      if(hint) addHint(field,select,hint);
      if(key==="drink") addDrinkAmount(field);
      if(key==="exercise") addDetails(field,"달리기는 몇 분으로 세나요?","달리기처럼 숨이 많이 차는 운동은 30분을 1시간으로 세요.");
      if(key==="smoke") addDetails(field,"지금도 피운다는 기준","지금도 정기적으로 피우고, 지금까지 피운 담배가 모두 100개비 이상일 때 골라요.");
      const study=moreStudies[key];
      if(section==="health" && (study?.eligibility || study?.unit))
        addDetails(field,"검사 기준 보기",[study.unit,study.eligibility].filter(Boolean).join(" · "));
    }
  }
}

function legacyFields(old,onlyActive) {
  const f={},s=old.selects||{},a=old.answers||{},studies=old.studyAnswers||{};
  const active=old.mode==="trend"?"base":s.domain??"lifestyle";
  f.basis=old.basis;
  f.region=old.mode==="trend" && onlyActive?"":s.region;
  f.mode=old.mode;f.bonus=s["bonus-basis"];
  const include=k=>!onlyActive || active===k;
  if(include("lifestyle")){
    const mappings={smoking:["smoke",["3","2"]],alcohol:["drink",["5","6"]],exercise:["exercise",["0","1"]],weight:["bmi",["4","5"]],sleep:["sleepBand",["2","4"]]};
    for(const [key,[to,values]] of Object.entries(mappings)) if(["0","1"].includes(a[key])) f[to]=values[Number(a[key])];
    if(s.history) f.history=s.history;
  }
  for(const key of ["household","marriage","education"]) if(include(key)) f[key]=s[key];
  for(const [key,answer] of Object.entries(studies)) {
    const study=moreStudies[key],v=answer?.value;
    if(!include(key) || !study || !v || !Object.hasOwn(study.groups,v)) continue;
    // Keep an explicitly excluded study out of the migrated calculation.
    if(study.eligibility && answer.eligible!=="yes") continue;
    if(key==="smokingOnly") f.smoke=v;
    else if(key==="alcoholOnly") f.drink=["0","1","4"][Number(v)];
    else if(key==="sleep") f.sleepBand=v;
    else if(key==="kidneyJoint"){
      f.kidney=String(Number(v)%4);f.urine=Number(v)>=4?"positive":"0";
    } else if(key==="metabolic"){
      f.metabolic=v;f.bmi=({"low":"0","0":"1","1":"2","2":"3"})[answer.bmi]??f.bmi;
    } else f[key]=v;
  }
  return cleanConditions(f);
}
function startup() {
  const now=Date.now(),today=isoDate(now);
  const blank={birth:"",birthTime:"",referenceDay:today,fields:cleanConditions()};
  try {
    const current=JSON.parse(localStorage.getItem(storageKey)||"null");
    if(current && (current.birth==="" || birthParts(current.birth,now))){
      const day=birthParts(current.referenceDay,now) && current.referenceDay>=current.birth?current.referenceDay:today;
      const fields=cleanConditions(current.fields),size=current.measurements;
      if(size?.height || size?.weight) fields.bmi=measuredBmiBand(Number(size.height),Number(size.weight));
      return {birth:current.birth,birthTime:birthMoment(current.birth,current.birthTime,now)?current.birthTime||"":"",referenceDay:day,fields,draft:current.draft?cleanConditions(current.draft):undefined,play:knownStories(current.play),measurements:size};
    }
    const old=JSON.parse(localStorage.getItem("life-clock-settings-v2")||localStorage.getItem("life-clock-settings-v1")||"null");
    if(old && birthParts(old.birth,now)){
      const day=birthParts(old.referenceDay,now) && old.referenceDay>=old.birth?old.referenceDay:today;
      return {birth:old.birth,referenceDay:day,fields:legacyFields(old,true),draft:legacyFields(old,false)};
    }
  } catch {}
  return blank;
}
buildEditor();
let applied=startup();
function showBirthSettings() {
  const settings=byId("birth-settings");
  if(applied.birth){
    byId("birth-edit-position").append(settings);
    settings.open=false;
    settings.querySelector("summary").textContent="생일 변경";
  }
  birthInput.max=isoDate(Date.now());
  birthInput.value=applied.birth;
  birthTimeInput.value=applied.birthTime||"";
  birthTimeInput.setCustomValidity("");birthInput.setCustomValidity("");
}
showBirthSettings();
function openEditor() {
  const fields=applied.draft??applied.fields;
  for(const key of fieldNames) {
    const select=byId("input-"+key),saved=fields[key];
    for(const option of select.options) {
      const legacy=historicalChoices[key]?.includes(option.value);
      option.hidden=Boolean(legacy && option.value!==saved);
      option.disabled=option.hidden;
    }
    select.value=key==="drink" && ["2","3"].includes(saved)?"4":saved || "";
  }
  const savedPlay=applied.play??[];
  for(const key of Object.keys(clockStories)) byId("story-"+key).checked=savedPlay.includes(key);
  const oldDays=previousStoryKeys.filter(key=>savedPlay.includes(key)).length;
  byId("previous-story-bonus").hidden=oldDays===0;
  byId("keep-previous-stories").checked=oldDays>0;
  byId("previous-story-label").textContent="지난 질문에서 받은 "+oldDays+"일 유지";
  refreshDrinkAmount();
  byId("drink-amount").value=["2","3"].includes(fields.drink)?fields.drink:"";
  for(const id of ["height","weight"]) byId(id).value=applied.measurements?.[id]??"";
  const hasSize=byId("height").value!=="" || byId("weight").value!=="";
  byId("size-feedback").textContent="";
  if(hasSize) syncBodySize();
  byId("bmi-direct").open=Boolean(!hasSize && fields.bmi);
  dialog.showModal();
  form.querySelector(".form-body").scrollTop=0;
  byId("dialog-title").focus({preventScroll:true});
}
let feedbackTimer;
function saveSettings(message) {
  clearTimeout(feedbackTimer);
  try {
    localStorage.setItem(storageKey,JSON.stringify(applied));
    put("save-feedback",message);
    feedbackTimer=setTimeout(()=>put("save-feedback",""),3000);
  } catch {
    put("save-feedback","이 기기에 저장하지 못했어요. 지금 화면에만 적용돼요.");
  }
  calculate();
}
function saveBirth(event) {
  event.preventDefault();
  const now=Date.now(),birth=birthParts(birthInput.value,now);
  if(!birth){
    birthInput.setCustomValidity("오늘까지의 생년월일을 입력해 주세요.");birthInput.reportValidity();return;
  }
  if(!birthMoment(birthInput.value,birthTimeInput.value,now)){
    birthTimeInput.setCustomValidity("지금까지의 태어난 시각을 입력해 주세요.");
    birthTimeInput.reportValidity();return;
  }
  const wasFirst=!applied.birth;
  const referenceDay=applied.birth===birthInput.value?applied.referenceDay:isoDate(now);
  applied={...applied,birth:birthInput.value,birthTime:birthTimeInput.value,referenceDay};
  showBirthSettings();
  saveSettings("생일을 저장했어요.");
  (wasFirst?byId("open-conditions"):byId("birth-settings").querySelector("summary")).focus();
}
function applyEditor(event) {
  event.preventDefault();
  const fields=cleanConditions({...applied.fields,...Object.fromEntries(fieldNames.map(k=>[k,byId("input-"+k).value]))});
  if(fields.drink==="4" && byId("drink-amount").value) fields.drink=byId("drink-amount").value;
  const measurements={height:byId("height").value,weight:byId("weight").value};
  const play=Object.keys(clockStories).filter(key=>byId("story-"+key).checked);
  if(byId("keep-previous-stories").checked) play.push(...previousStoryKeys.filter(key=>applied.play?.includes(key)));
  const modelChanged=Object.entries(conditionSections).some(([section,defs])=>
    section!=="daily" && defs.some(([key])=>key!=="pet" && fields[key]!==applied.fields[key]));
  const referenceDay=modelChanged?isoDate(Date.now()):applied.referenceDay;
  applied={birth:applied.birth,birthTime:applied.birthTime||"",referenceDay,fields,measurements,play};
  dialog.close();
  saveSettings("조건을 저장했어요.");
}
function calculate() {
  clearTimeout(timer);
  const now=Date.now(), birth=birthMoment(applied.birth,applied.birthTime,now);
  if(!birth){
    clock=null;
    clearClockDisplay();
    put("encouragement","생일을 입력하면 시계가 시작돼요.");
    return;
  }
  const refDate=birthParts(applied.referenceDay,now)??parts(now);
  const ref=midnight(refDate.year,refDate.month,refDate.day)+birth.offset;
  const born=birth.timestamp;
  const f=applied.fields;
  const age=calendarMonths(birth,ref)/12;
  const model=combinedEstimate(age,f);
  const base=trendTarget(birth,model.sex);
  let target=base;
  for(const shift of Object.values(model.effects)){
    target+=trendTarget(birth,model.sex,shift)-base;
  }
  if(f.bonus==="current" && target<=ref){
    target=Math.round((ref+Math.max(0,model.years)*YEAR_MS)/1000)*1000;
  }
  const adjustment=playAdjustment(knownStories(applied.play),f);
  const hasPlay=adjustment.terms.length>0;
  target+=adjustment.days*DAY*1000;
  if(!Number.isFinite(target) || target<=born){clock=null;clearClockDisplay();put("encouragement","");put("remaining-label","계산 범위 밖");put("remaining","계산 범위 밖");return;}
  clock={born,target,play:hasPlay};
  tick();
}
byId("open-conditions").addEventListener("click",openEditor);
for(const id of ["cancel","cancel-x"]) byId(id).addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>byId("open-conditions").focus({preventScroll:true}));
for(const input of [birthInput,birthTimeInput]) input.addEventListener("input",()=>{birthInput.setCustomValidity("");birthTimeInput.setCustomValidity("");});
form.addEventListener("submit",applyEditor);
byId("birth-form").addEventListener("submit",saveBirth);
document.addEventListener("visibilitychange",tick);
window.addEventListener("pageshow",calculate);
calculate();
