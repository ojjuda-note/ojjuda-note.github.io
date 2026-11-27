"use strict";

const clockPanel=document.querySelector(".life-reading");
const skyWindow=document.getElementById("sky-window");
const rangeOfDay=[
  [3,"night","밤"],[6,"dawn","새벽"],[11,"morning","아침"],
  [17,"noon","점심"],[20,"evening","저녁"],[24,"night","밤"]
];
const clockHands=["hour-hand","minute-hand","second-hand"].map(id=>document.getElementById(id));
const dialNumbers=document.getElementById("dial-numbers");
for(let hour=1;hour<=12;hour++) {
  const mark=document.createElement("span");
  const angle=hour*Math.PI/6;
  mark.textContent=String(hour);
  mark.style.left=(50+39*Math.sin(angle))+"%";
  mark.style.top=(50-39*Math.cos(angle))+"%";
  if(hour%3===0) mark.className="cardinal";
  dialNumbers.append(mark);
}
function dialPhase(seconds) {
  const hour=Math.floor(seconds/3600)%24;
  const [,id,name]=rangeOfDay.find(([limit])=>hour<limit);
  return {id,name,meridiem:hour<12?"AM":"PM"};
}
function drawLifeDial(seconds,text) {
  const phase=dialPhase(seconds);
  if(clockPanel.dataset.phase!==phase.id){
    clockPanel.dataset.phase=phase.id;
    paintClockScenery(skyWindow,phase.id);
  }
  put("meridiem",phase.meridiem);put("daypart",phase.name);
  put("life-time",text);
  const angles=[seconds/120,seconds/10,seconds*6];
  clockHands.forEach((hand,i)=>{hand.style.transform="rotate("+(angles[i]%360).toFixed(5)+"deg)";});
}

const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
const board=document.getElementById("flip-board");
const flipUnits=["년","개월","일","시간","분","초"];
const panels=flipUnits.map(label=>{
  const unit=document.createElement("div"),tile=document.createElement("div"),caption=document.createElement("span");
  unit.className="flip-unit";tile.className="flip-tile";caption.className="flip-caption";caption.textContent=label;
  for(const side of ["upper","lower","old-lower","turn-upper","turn-lower"]){
    const leaf=document.createElement("span");leaf.className="leaf "+side;leaf.dataset.value="--";tile.append(leaf);
  }
  tile.lastElementChild.addEventListener("animationend",()=>tile.classList.remove("turning"));
  unit.append(tile,caption);board.append(unit);return tile;
});
let lastBoardClock=null,lastBoardTime=0;
function setPanel(tile,value,animate) {
  const previous=tile.dataset.value;
  if(!animate) tile.classList.remove("turning");
  if(value===previous) return;
  const stillTurning=tile.classList.contains("turning");
  tile.classList.remove("turning");
  tile.dataset.value=value;
  tile.dataset.long=String(value.length);
  const [upper,lower,oldLower,turnUpper,turnLower]=tile.children;
  upper.dataset.value=lower.dataset.value=value;
  if(!previous || !animate || stillTurning) return;
  oldLower.dataset.value=turnUpper.dataset.value=previous;
  turnLower.dataset.value=value;
  tile.classList.add("turning");
}
function drawFlipBoard(left,model,now) {
  const animate=lastBoardClock===model && now-lastBoardTime===1000 && !reducedMotion.matches;
  const fields=[left.years,left.months,left.days,Math.floor(left.seconds/3600),Math.floor(left.seconds/60)%60,left.seconds%60];
  fields.forEach((n,i)=>setPanel(panels[i],String(n).padStart(2,"0"),animate));
  lastBoardClock=model;lastBoardTime=now;
}
function clearClockDisplay() {
  lastBoardClock=null;clockPanel.dataset.phase="unknown";
  paintClockScenery(skyWindow,"night");
  put("meridiem","—");put("daypart","—");put("life-time","--:--:--");
  panels.forEach(tile=>setPanel(tile,"--",false));
}
