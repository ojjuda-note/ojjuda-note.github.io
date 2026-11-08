// Janggi rules duplicated from world.html for the background AI worker.
// Keep this exact rule span in sync; janggi-advanced-ai.test.cjs verifies parity.
var vt=(t,e)=>t<0||t>=9||e<0||e>=10?-1:e*9+t,kn=t=>[t%9,Math.floor(t/9)],r2=t=>t>="A"&&t<="Z",ue=t=>t?r2(t)?"c":"h":"",Ya=t=>t==="c"?"h":"c",Do=t=>t.toUpperCase(),ml=(t,e)=>t>=3&&t<=5&&(e>=0&&e<=2||e>=7&&e<=9),la=t=>t<=2?0:7;function dl(t,e){if(!ml(t,e))return[];let o=la(e),r=4,a=o+1;return t===r&&e===a?[[3,o],[5,o],[3,o+2],[5,o+2]]:(t===3||t===5)&&(e===o||e===o+2)?[[r,a]]:[]}var JG_LAYOUTS=[["eheh","상마상마"],["ehhe","상마마상"],["heeh","마상상마"],["hehe","마상마상"]],JG_DEFAULT="eheh",JG_DEFAULT_H="hehe",jgLayout=(t,e)=>JG_LAYOUTS.some(o=>o[0]===t)?t:e==="h"?JG_DEFAULT_H:JG_DEFAULT,jgReady=t=>!!t&&JG_LAYOUTS.some(e=>e[0]===t.c)&&JG_LAYOUTS.some(e=>e[0]===t.h);function vp(e={}){let t=Array(90).fill(""),o=[...jgLayout(e.h,"h")].reverse().join(""),r=jgLayout(e.c,"c");["r",o[0],o[1],"a","","a",o[2],o[3],"r"].forEach((a,i)=>{a&&(t[vt(i,0)]=a)}),["r",r[0],r[1],"a","","a",r[2],r[3],"r"].forEach((a,i)=>{a&&(t[vt(i,9)]=a.toUpperCase())}),t[vt(4,1)]="k",t[vt(4,8)]="K",t[vt(1,2)]="c",t[vt(7,2)]="c",t[vt(1,7)]="C",t[vt(7,7)]="C";for(let a of[0,2,4,6,8])t[vt(a,3)]="p",t[vt(a,6)]="P";return{b:t,t:"c",n:0,passes:0}}function Ep(t,e){let o=t[e];if(!o)return[];let r=ue(o),a=Do(o),[i,l]=kn(e),s=[],c=p=>p>=0&&ue(t[p])!==r,d=p=>{c(p)&&s.push(p)};if(a==="K"||a==="A"){for(let[p,f]of[[1,0],[-1,0],[0,1],[0,-1]]){let m=i+p,h=l+f;ml(m,h)&&la(h)===la(l)&&d(vt(m,h))}for(let[p,f]of dl(i,l))d(vt(p,f))}else if(a==="R"){for(let[p,f]of[[1,0],[-1,0],[0,1],[0,-1]]){let m=i+p,h=l+f;for(;vt(m,h)>=0;){let u=vt(m,h);if(t[u]){ue(t[u])!==r&&s.push(u);break}s.push(u),m+=p,h+=f}}for(let[p,f]of dl(i,l)){let m=vt(p,f);if(t[m]){ue(t[m])!==r&&s.push(m);continue}if(s.push(m),p===4&&(i===3||i===5)){let h=8-i,u=2*f-l,b=vt(h,u);t[b]?ue(t[b])!==r&&s.push(b):s.push(b)}}}else if(a==="C"){for(let[p,f]of[[1,0],[-1,0],[0,1],[0,-1]]){let m=i+p,h=l+f,u=!1;for(;vt(m,h)>=0;){let b=vt(m,h);if(u){if(t[b]){ue(t[b])!==r&&Do(t[b])!=="C"&&s.push(b);break}s.push(b)}else if(t[b]){if(Do(t[b])==="C")break;u=!0}m+=p,h+=f}}if(ml(i,l)&&(i===3||i===5)&&(l===la(l)||l===la(l)+2)){let p=la(l)+1,f=vt(4,p),m=vt(8-i,2*p-l);t[f]&&Do(t[f])!=="C"&&(!t[m]||ue(t[m])!==r&&Do(t[m])!=="C")&&s.push(m)}}else if(a==="H")for(let[p,f,m]of[[0,-1,[[-1,-2],[1,-2]]],[0,1,[[-1,2],[1,2]]],[-1,0,[[-2,-1],[-2,1]]],[1,0,[[2,-1],[2,1]]]]){let h=vt(i+p,l+f);if(!(h<0||t[h]))for(let[u,b]of m)d(vt(i+u,l+b))}else if(a==="E")for(let[p,f,m]of[[0,-1,[[-1,-1],[1,-1]]],[0,1,[[-1,1],[1,1]]],[-1,0,[[-1,-1],[-1,1]]],[1,0,[[1,-1],[1,1]]]]){let h=vt(i+p,l+f);if(!(h<0||t[h]))for(let[u,b]of m){let F=vt(i+p+u,l+f+b);F<0||t[F]||d(vt(i+p+2*u,l+f+2*b))}}else if(a==="P"){let p=r==="c"?-1:1;d(vt(i,l+p)),d(vt(i-1,l)),d(vt(i+1,l));for(let[f,m]of dl(i,l))m===l+p&&d(vt(f,m))}return s}var Ap=(t,e)=>t.indexOf(e==="c"?"K":"k");function Cp(t,e,o){for(let r=0;r<t.length;r++)if(t[r]&&ue(t[r])===o&&Ep(t,r).includes(e))return!0;return!1}var hl=(t,e=t.t)=>Cp(t.b,Ap(t.b,e),Ya(e));// Each side may shuttle the same piece twice; a third identical move is blocked.
function jgBikjangKey(board,turn){
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
function jgRepeats(state,move){
 const last=state.shuttle?.[state.t];
 return !move.pass&&!state.b[move.t]&&!!last&&last.run>=4&&move.f===last.t&&move.t===last.f&&!jgCompletesBikjang(state,move);
}
function jgShuttleAfter(state,move){
 const last=state.shuttle?.[state.t];
 const reverse=!move.pass&&!state.b[move.t]&&last&&move.f===last.t&&move.t===last.f;
 return {...state.shuttle,[state.t]:move.pass?null:{f:move.f,t:move.t,run:reverse?last.run+1:1}};
}
function ca(t,e){
 const b=jgMovedBoard(t,e),turn=Ya(t.t),key=jgBikjangKey(b,turn);
 const bikjangKeys=key?{...t.bikjangKeys,[key]:(t.bikjangKeys?.[key]||0)+1}:t.bikjangKeys;
 return {b,t:turn,n:t.n+1,passes:e.pass?(t.passes||0)+1:0,shuttle:jgShuttleAfter(t,e),bikjangKeys};
}function Dr(t,history=false){let e=[];for(let o=0;o<t.b.length;o++)if(!(!t.b[o]||ue(t.b[o])!==t.t))for(let r of Ep(t.b,o)){let a={f:o,t:r};if(!history&&jgRepeats(t,a))continue;t.b[r]&&(a.x=1);let i=ca(t,a).b;Cp(i,Ap(i,t.t),Ya(t.t))||e.push(a)}return e}var Za=t=>!hl(t),a2={R:13,C:7,H:5,E:3,A:3,P:2,K:0};function Fn(t,e){let o=e==="h"?1.5:0;for(let r of t)r&&ue(r)===e&&(o+=a2[Do(r)]);return o}function Mp(t){if(jgBikjangDraw(t))return{over:!0,result:"draw",reason:"bikjang"};let e=Dr(t),o=hl(t);if(!e.length&&o)return{over:!0,result:Ya(t.t),reason:"checkmate"};if((t.passes||0)>=2&&!jgBikjangKey(t.b,t.t)){let r=Fn(t.b,"c"),a=Fn(t.b,"h");return{over:!0,result:r>a?"c":"h",reason:"points",points:{c:r,h:a}}}if(t.n>=400){let r=Fn(t.b,"c"),a=Fn(t.b,"h");return{over:!0,result:r>a?"c":"h",reason:"points",points:{c:r,h:a}}}return{over:!1,check:o,moves:e,mustPass:!e.length}}var Dp=(t,e,history=false)=>e.pass?Za(t)?{pass:1}:null:Dr(t,history).find(o=>o.f===e.f&&o.t===e.t)||null,ul={R:1300,C:700,H:500,E:300,A:300,P:200,K:0};function pl(t){let e=0;for(let o=0;o<t.b.length;o++){let r=t.b[o];if(!r)continue;let a=ue(r),i=Do(r),[l,s]=kn(o),c=ul[i];i==="P"&&(c+=(a==="c"?6-s:s-3)*12+(4-Math.abs(l-4))*4),(i==="H"||i==="C"||i==="R")&&(c+=(4-Math.abs(l-4))*5),e+=a==="c"?c:-c}return t.t==="c"?e:-e}

export const janggiRules = Object.freeze({ moves: Dr, apply: ca, evaluate: pl, isCheck: hl, isDraw: jgBikjangDraw, status: Mp });
export { vp as createJanggiStart };

