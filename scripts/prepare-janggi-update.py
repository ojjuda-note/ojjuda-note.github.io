from pathlib import Path
root=Path.cwd()
world=root/'world.html';server=root/'supabase/functions/game-action/engines.mjs'
old_ca='function ca(t,e){if(e.pass)return{b:t.b,t:Ya(t.t),n:t.n+1,passes:(t.passes||0)+1};let o=t.b.slice();return o[e.t]=o[e.f],o[e.f]="",{b:o,t:Ya(t.t),n:t.n+1,passes:0}}'
new_ca='''// Each side may shuttle the same piece twice; a third identical move is blocked.
function jgRepeats(state,move){
 const last=state.shuttle?.[state.t];
 return !move.pass&&!state.b[move.t]&&!!last&&last.run>=4&&move.f===last.t&&move.t===last.f;
}
function jgShuttleAfter(state,move){
 const last=state.shuttle?.[state.t];
 const reverse=!move.pass&&!state.b[move.t]&&last&&move.f===last.t&&move.t===last.f;
 return {...state.shuttle,[state.t]:move.pass?null:{f:move.f,t:move.t,run:reverse?last.run+1:1}};
}
function ca(t,e){const shuttle=jgShuttleAfter(t,e);if(e.pass)return{b:t.b,t:Ya(t.t),n:t.n+1,passes:(t.passes||0)+1,shuttle};let o=t.b.slice();return o[e.t]=o[e.f],o[e.f]="",{b:o,t:Ya(t.t),n:t.n+1,passes:0,shuttle}}'''
for p in [world,server]:
 s=p.read_text()
 def replace(a,b):
  global s
  assert s.count(a)==1,(p.name,a[:80],s.count(a))
  s=s.replace(a,b)
 replace('[["eheh","상마상마"],["hehe","마상마상"],["ehhe","상마마상"],["heeh","마상상마"]]','[["eheh","상마상마"],["ehhe","상마마상"],["heeh","마상상마"],["hehe","마상마상"]]')
 replace(old_ca,new_ca)
 replace('function Dr(t){','function Dr(t,history=false){')
 replace('let a={f:o,t:r};t.b[r]&&(a.x=1);','let a={f:o,t:r};if(!history&&jgRepeats(t,a))continue;t.b[r]&&(a.x=1);')
 replace('Dp=(t,e)=>e.pass?Za(t)?{pass:1}:null:Dr(t).find','Dp=(t,e,history=false)=>e.pass?Za(t)?{pass:1}:null:Dr(t,history).find')
 if p==world:
  replace('let l=o.find(r,i);','let l=o.find(r,i,true);')
  replace('let p=n.find(E.s,f);','let p=n.find(E.s,f,true);')
  replace('function Ka(t,e){let o=ze();','function Ka(t,e){if(!e&&E.kind==="janggi"&&jgRepeats(E.s,t)){M("같은 말을 같은 두 칸으로 3번 반복할 수 없어요");return}let o=ze();')
  replace('if(E.sel>=0&&E.targets.includes(t)){','if(E.kind==="janggi"&&E.sel>=0&&jgRepeats(E.s,{f:E.sel,t})&&Dp(E.s,{f:E.sel,t},true)){M("같은 말을 같은 두 칸으로 3번 반복할 수 없어요");return}if(E.sel>=0&&E.targets.includes(t)){')
  replace('return/too_many_invites/.test(e)?','return/repeated_move/.test(e)?"같은 말을 같은 두 칸으로 3번 반복할 수 없어요":/too_many_invites/.test(e)?')
  replace('[["c","초(나)"],["h","한(상대)"]]','[["c","초 배치"],["h","한 배치"]]')
  replace('<div class="bd-layout">${','<div class="bd-layout" aria-label="시작 전 상·마 배치"><p class="note">각 진영에서 보는 왼쪽부터</p>${')
  # Keep one visible chooser shared by computer, invitation and same-device play.
  a=s.index('async function Hp(');b=s.index('async function vn(',a)
  menu=s[a:b]
  menu=menu.replace("${t==='janggi'?jgChooser():''}",'')
  menu=menu.replace('<section data-entry-panel="computer">',"${t==='janggi'?jgChooser():''}\n <section data-entry-panel=\"computer\">")
  menu=menu.replace("순서${t==='janggi'?' · 말 배치':''} 설정",'순서 설정')
  s=s[:a]+menu+s[b:]
  replace('zp(E.kind,E.mode,{level:E.level,me:E.me,layout:E.layout})','E.kind==="janggi"?vn(E.kind):zp(E.kind,E.mode,{level:E.level,me:E.me,layout:E.layout})')
 else:
  replace('janggi:{init:vp,apply:ca,find:Dp,status:Mp,best:Bp,first:"c"}','janggi:{init:vp,apply:ca,find:Dp,status:Mp,best:Bp,repeats:jgRepeats,first:"c"}')
 p.write_text(s)
p=root/'supabase/functions/game-action/rules.mjs';s=p.read_text().replace('engine.find(state, input);','engine.find(state, input, true);',1).replace('engine.find(state,stored);','engine.find(state,stored,true);')
s=s.replace('    const legal = engine.find(state, input);','    if (engine.repeats?.(state, input)) fail(\'repeated_move\');\n    const legal = engine.find(state, input);')
p.write_text(s)
rev='20261106-janggi-setup-repeat1'
p=root/'shared/games/world-game-assets.js';s=p.read_text();import re
s=re.sub(r"const revision='[^']+'",f"const revision='{rev}'",s).replace("janggi:'1.4.4'","janggi:'1.5.0'");p.write_text(s)
p=root/'game-release.json';p.write_text('{"revision":"'+rev+'"}\n')
p=world;s=p.read_text();s=re.sub(r'(shared/games/world-game-assets.js\?v=)[^"\s]+',r'\g<1>'+rev,s);p.write_text(s)

p=root/'tests/package.json';s=p.read_text().replace('node game-verification.test.cjs &&','node game-verification.test.cjs && node --test janggi-setup-repetition.test.cjs &&');p.write_text(s)
