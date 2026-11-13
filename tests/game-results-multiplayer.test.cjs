// unchanged production source at line 1
});

test('mines result decoration keeps restart and inspect handlers for successive rounds',t=>{
 const w=fixture(t,'<div id="result"><div id="minesResultCard"><div id="mines-result-navigation" class="game-result-navigation"><button id="mines-result-exit">나가기</button><button id="again">계속하기</button></div><button id="look">판 보기</button></div></div>');
 const again=w.document.querySelector('#again'),look=w.document.querySelector('#look');let restart=0,inspect=0;again.onclick=()=>restart++;look.onclick=()=>inspect++;
 w.eval(`window.OjjudaMinesEntry={comparison:()=>null};const $=s=>document.querySelector(s),L={name:'고급',m:10},cells=Array(100),opened=35;let runId='first';const later=fn=>fn();${section('games/mines/index.html','function result(won,sec,rec,prev){','\n\n// view:')}window.setRun=id=>{runId=id;};`);
 w.result(false);again.click();w.setRun('second');w.result(true,42,true,50);look.click();
// unchanged production source at line 146
