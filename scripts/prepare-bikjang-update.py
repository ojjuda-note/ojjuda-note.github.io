from pathlib import Path
import re
root=Path.cwd()
helpers='''function jgBikjangKey(board,turn){
 const cho=board.indexOf("K"),han=board.indexOf("k");
 if(cho<0||han<0||cho%9!==han%9)return null;
 for(let square=Math.min(cho,han)+9;square<Math.max(cho,han);square+=9)if(board[square])return null;
 return board.map(piece=>piece||".").join("")+turn;
}
function jgMovedBoard(state,move){
 if(move.pass)return state.b;
 const board=state.b.slice();board[move.t]=board[move.f];board[move.f]="";return board;
}
function jgBikjangDraw(state){
 const key=jgBikjangKey(state.b,state.t);
 return !!key&&(state.bikjangKeys?.[key]||0)>=3;
}
function jgCompletesBikjang(state,move){
 const key=jgBikjangKey(jgMovedBoard(state,move),Ya(state.t));
 return !!key&&(state.bikjangKeys?.[key]||0)>=2;
}
'''
old_ca='function ca(t,e){const shuttle=jgShuttleAfter(t,e);if(e.pass)return{b:t.b,t:Ya(t.t),n:t.n+1,passes:(t.passes||0)+1,shuttle};let o=t.b.slice();return o[e.t]=o[e.f],o[e.f]="",{b:o,t:Ya(t.t),n:t.n+1,passes:0,shuttle}}'
new_ca='''function ca(t,e){
 const b=jgMovedBoard(t,e),turn=Ya(t.t),key=jgBikjangKey(b,turn);
 const bikjangKeys=key?{...t.bikjangKeys,[key]:(t.bikjangKeys?.[key]||0)+1}:t.bikjangKeys;
 return {b,t:turn,n:t.n+1,passes:e.pass?(t.passes||0)+1:0,shuttle:jgShuttleAfter(t,e),bikjangKeys};
}'''
for p in [root/'world.html',root/'supabase/functions/game-action/engines.mjs']:
 s=p.read_text()
 def replace(a,b):
  global s
  assert s.count(a)==1,(p.name,a[:80],s.count(a));s=s.replace(a,b)
 replace('function jgRepeats(state,move){',helpers+'function jgRepeats(state,move){')
 replace('last.run>=4&&move.f===last.t&&move.t===last.f;','last.run>=4&&move.f===last.t&&move.t===last.f&&!jgCompletesBikjang(state,move);')
 replace(old_ca,new_ca)
 replace('function Mp(t){let e=Dr(t),o=hl(t);','function Mp(t){if(jgBikjangDraw(t))return{over:!0,result:"draw",reason:"bikjang"};let e=Dr(t),o=hl(t);')
 replace('if((t.passes||0)>=2){','if((t.passes||0)>=2&&!jgBikjangKey(t.b,t.t)){')
 replace('function Bp(t,e="normal",o=1500){','function Bp(t,e="normal",o=1500){if(jgBikjangDraw(t))return null;')
 replace('function c(h,u,b,F){let C=pl(h);','function c(h,u,b,F){if(jgBikjangDraw(h))return 0;let C=pl(h);')
 replace('function d(h,u,b,F,C){let x=Dr(h);','function d(h,u,b,F,C){if(jgBikjangDraw(h))return 0;let x=Dr(h);')
 if p.name=='world.html':
  replace('repetition:"같은 장면이 세 번 나왔어요",','repetition:"같은 장면이 세 번 나왔어요",bikjang:"같은 빅장 3회",')
  replace("const metric=draw?'':E.mode==='local'?", "const metric=draw?(result.reason==='bikjang'?'같은 빅장 3회':''):E.mode==='local'?")
 p.write_text(s)
rev='20261106-janggi-bikjang3'
p=root/'shared/games/world-game-assets.js';s=p.read_text();s=re.sub(r"const revision='[^']+'",f"const revision='{rev}'",s).replace("janggi:'1.5.0'","janggi:'1.6.0'");p.write_text(s)
p=root/'game-release.json';p.write_text('{"revision":"'+rev+'"}\n')
p=root/'world.html';s=p.read_text();s=re.sub(r'(shared/games/world-game-assets.js\?v=)[^"\s]+',r'\g<1>'+rev,s);p.write_text(s)
p=root/'tests/package.json';s=p.read_text().replace('node --test janggi-setup-repetition.test.cjs &&','node --test janggi-setup-repetition.test.cjs janggi-bikjang.test.cjs &&');p.write_text(s)
