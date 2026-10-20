const fs=require('node:fs'),path=require('node:path');
const acorn=require('acorn'),walk=require('acorn-walk');
const root=process.argv[2]||'.';
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const change=(s,a,b)=>{if(!s.includes(a))throw Error('Missing '+a.slice(0,90));return s.replace(a,b);};
let html=read('world.html');
const retiredAssets=['world-life.css','world-donflow.js','world-schedule.js','world-life.js','world-board-comments.js','world-house-visit.css','world-house-visit.js','world-places.js'];
html=html.replace(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>(?:<\/script>)?/g,(tag,url)=>retiredAssets.some(f=>url.split('?')[0].endsWith('/'+f))||url.includes('/house-test/')?'':tag);
let match=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('module'));
let s=match[2],ast=acorn.parse(s,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
const replaceNode=(n,value='')=>edits.push([n.start,n.end,value]);
const fnBodies={
 renderWorldShell:"if(worldParkNotes?.preserveShell(markup))return;z('#app').innerHTML=markup;",
 openWorldHouse:"sr.tab({tab:'arcade'});",
 closeWorldHouse:"return false;",
 syncWorldHouse:"",
 mountWorldLife:"",
 Sg:"return '';",Ig:"return '';",jg:"return '';",
 adminDataTab:'return L.area==="content"&&L.tab==="risk"&&L.riskType==="chats"?"chats":L.area==="operations"&&L.tab==="spam"&&L.spamType==="chats"?"settings":L.tab;',
 syncAdminContentFilters:'if(L.area==="content"&&L.tab==="risk"&&L.riskType==="chats")L.cr="__risk__";'
};
for(const f of ast.body.filter(n=>n.type==='FunctionDeclaration')){
 if(Object.hasOwn(fnBodies,f.id.name))replaceNode(f.body,'{'+fnBodies[f.id.name]+'}');
 if(f.id.name==='y0')for(const n of f.body.body.filter(n=>n.type==='IfStatement')){
  const t=s.slice(n.test.start,n.test.end);
  if(['adminDataTab()==="posts"','adminDataTab()==="archive"','adminDataTab()==="quiz"','L.area==="content"&&L.tab==="archive"','L.area==="content"&&L.tab==="house-content"','L.area==="content"&&L.tab==="review"'].includes(t))replaceNode(n);
 }
 if(f.id.name==='mountAdminModule')walk.simple(f.body,{IfStatement(n){if(['name==="house-content"','name==="review"'].includes(s.slice(n.test.start,n.test.end)))replaceNode(n);}});
}
for(const n of ast.body){
 if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'){
  const lhs=n.expression.left;
  if(lhs.type==='MemberExpression'&&lhs.object.name==='sr'&&/^(house-|visit-|furniture-studio)/.test(lhs.property.value||''))replaceNode(n);
 }
}
for(const [a,b,v] of edits.sort((a,b)=>b[0]-a[0]))s=s.slice(0,a)+v+s.slice(b);
s=change(s,'e==="home"?Sg():e==="friends"?jg():e==="deco"?Ig():e==="board"?\'<section data-board-root aria-label="게시판"></section>\':e==="life"?\'<section data-life-root aria-label="생활"></section>\':Yg()','Yg()');
s=s.replace('syncWorldHouse();','').replace('mountWorldLife();','').replace('worldPlaceArt?.mount();','');
s=s.replace(/var worldPlaceArt=window\.OjjudaPlaceArt\?\.install\([\s\S]*?\n\}\);/,'var worldPlaceArt=null;');
s=change(s,'[["review","전체 콘텐츠"],["house-content","글·댓글"],["photo-stages","포토땅따먹기"],["posts","사진·영상·기록"],','[["photo-stages","포토땅따먹기"],');
s=change(s,'["spam","도배 방지"],["quiz","퀴즈"],','["spam","도배 방지"],');
s=change(s,'tab:"review",area:"content"','tab:"cards",area:"content"');
s=s.replace('L.area==="content"&&L.tab==="house-content"?"house-content":','').replace('L.area==="content"&&L.tab==="review"?"review":','');
s=s.replace('[["posts","게시글"],["chats","대화"],["cards","카드·답글"]]','[["chats","대화"],["cards","카드·답글"]]');
s=s.replace('["posts","chats","cards"].includes(view.riskType)','["chats","cards"].includes(view.riskType)').replace('L.archiveType=view.archiveType==="cards"?"cards":"posts"','L.archiveType="cards"').replace('if(L.tab==="archive"&&L.archiveType==="cards")','if(L.tab==="archive")');
s=s.replace('U.contentFeed("risk",null,null).catch(()=>[])','Promise.resolve([])');
s=s.replace(/<div class="pc-visit">[\s\S]*?<\/div>/,'');
s=s.replace('공개·차단','차단 관리').replace('친구들은 체험용 가상 친구예요.','');
s=s.replace(/<div class="line-row"><a href="https:\/\/github.com\/songys\/Chatbot_data"[\s\S]*?<\/div>/,'');
s=s.replaceAll('OjjudaBoard','OjjudaGameRankings').replace('rankingsOnly:true,','');
html=html.slice(0,match.index)+match[0].replace(match[2],s)+html.slice(match.index+match[0].length);
html=html.replaceAll('/world-board.js?v=20261021-arcade-ranks1','/world-game-rankings.js?v=20261021-1').replaceAll('/world-board.css?v=20261009-comments2','/world-game-rankings.css?v=20261021-1').replace('/world-admin-loader.js?v=20261009-speed1','/world-admin-loader.js?v=20261021-1');
write('world.html',html);

// Retain only the established leaderboard implementation and lifecycle.
let board=read('world-board.js');
const leaders=board.slice(board.indexOf('  function leaders(token){'),board.indexOf('  async function home(){'));
const access=board.slice(board.indexOf('  const matgoAccess='),board.lastIndexOf('\n }'));
write('world-game-rankings.js',`/* Arcade monthly rankings. Uses the current viewer session. */
(()=>{'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=action;return n;};
let dispose=null,controller=null;
function mount(host,{client,owner,games={},onOpenGame=null,authorized=()=>true}={}){
dispose?.();dispose=null;controller=null;if(!host)return;
let rankDispose=()=>{},rankPage=0,rankFocusGame=null,alive=true,request=0;
const active=()=>alive&&host.isConnected&&authorized();
const status=el('p','','board-status');status.setAttribute('role','status');
const content=el('div');host.replaceChildren(status,content);
async function result(query){const {data,error}=await query;if(error)throw error;if(!active())throw Error('stale');return data||[];}
${leaders.replace('||dialog||','||')}
async function home(){rankDispose();const token=++request;content.replaceChildren();status.textContent='';await Promise.all(leaders(token));return active()&&token===request;}
dispose=()=>{rankDispose();alive=false;request++;};
controller={refresh:home};
if(!client||!owner){status.textContent='로그인하면 게임 순위를 볼 수 있어요.';content.append(Object.assign(el('a','로그인','btn'),{href:'/?auth=login&next=world'}));return;}
void home();
${access.replace('if(!view&&!dialog)void home();','void home();')}
}
window.OjjudaGameRankings={mount,back:()=>false,refresh:()=>controller?.refresh()??Promise.resolve(false)};
})();\n`);
const css=read('world-board.css');
write('world-game-rankings.css','[data-arcade-rank-root]{min-width:0}.board-status:empty{display:none}\n'+css.slice(css.indexOf('/* Dark green chalkboard'),css.indexOf('/* Reply directly')));
write('world-room.css',`.bottomnav{grid-template-columns:repeat(3,minmax(0,1fr))}
.arcade-home{display:grid;gap:16px;min-width:0}.arcade-home .visit-banner{margin:0}.arcade-home .board-leaders{margin:0}.arcade-home #ppanel{position:static;min-width:0;border:1px solid var(--line);border-radius:22px;background:var(--surface);overflow:hidden}
@media(max-width:620px){.arcade-home .visit-banner{flex-wrap:wrap;gap:8px}}
`);
let loader=read('world-admin-loader.js');loader=loader.replace(/"\/admin\/(?:house-content|review-inbox)\.(?:js|css)\?[^"\n]+", /g,'');write('world-admin-loader.js',loader);
let accounts=read('admin/accounts.js');accounts=accounts.replace(/const activityKinds = \{[^\n]+\};/,"const activityKinds = {room:'프로필',chat:'대화',game:'게임'};");write('admin/accounts.js',accounts);

let index=read('index.html');
index=index.replace(/<figure class="world-welcome-(?:art|visual)"[\s\S]*?<\/figure>/,'');
index=index.replace('나만의 방을 꾸미고, 공원에서 마음을 나누고,<br>친구와 게임 한 판. 우리의 하루가 한곳에 모여요.','오락실에서 게임 한 판, 공원에서 나누는 이야기.<br>우리의 하루가 한곳에 모여요.');
index=index.replace(/<a class="world-feature"[\s\S]*?<\/a>/g,'');
index=change(index,'<div class="world-feature-grid">','<div class="world-feature-grid">'+[['arcade','오락실','게임을 즐기고 이번 달 게임 순위를 확인해요.'],['park','공원','카드로 이야기를 나누고 서로의 하루를 만나요.'],['my','설정','프로필, 계정과 알림을 관리해요.']].map(([id,title,body])=>`<a class="world-feature" href="/world.html?tab=${id}"><h3>${title}</h3><p>${body}</p></a>`).join(''));
index=index.replaceAll('가입부터 방 꾸미기, 카드 쓰기와 게임까지.','게임과 공원 카드, 계정 설정까지.').replaceAll('우리집부터 공원과 오락실까지, 오쭈다 월드에서 함께해요.','오락실에서 게임을 즐기고 공원에서 이야기를 나눠요.');
write('index.html',index);write('portal.js',read('portal.js').replaceAll('우리집부터 공원과 오락실까지, 오쭈다 월드에서 함께해요.','오락실에서 게임을 즐기고 공원에서 이야기를 나눠요.'));
for(const name of ['guide.html','sitemap.html'])write(name,`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name==='guide.html'?'사용 안내':'사이트맵'} · 오쭈다월드</title><link rel="icon" href="/favicon.svg"><style>body{max-width:680px;margin:40px auto;padding:20px;font-family:system-ui;line-height:1.8;color:#302d3d;background:#faf8fc}a{color:#704bae}section{padding:18px 0;border-bottom:1px solid #ddd}h1{font-size:28px}</style><main><a href="/world.html">오쭈다월드로 돌아가기</a><h1>오쭈다월드 사용 안내</h1><section><h2><a href="/world.html?tab=arcade">오락실</a></h2><p>상단에서 이번 달 게임 순위를 확인하고, 아래에서 원하는 게임을 골라 시작하세요. 게임 규칙은 각 게임의 안내에서 확인할 수 있어요.</p></section><section><h2><a href="/world.html?tab=park">공원</a></h2><p>카드를 읽고 글과 답글, 공감으로 이야기를 나눠요.</p></section><section><h2><a href="/world.html?tab=my">설정</a></h2><p>프로필·계정정보, 화면·알림, 차단 목록과 ZU를 관리해요. 문의·의견을 보낼 수 있고, 관리자는 설정 안에서 관리자 모드를 열 수 있어요.</p></section><p><a href="/terms.html">이용약관</a> · <a href="/privacy.html">개인정보처리방침</a></p></main></html>\n`);
for(const f of ['world-three-menus.test.cjs','world-board-tank.test.cjs']){let t=read('tests/'+f).replaceAll('world-board.js','world-game-rankings.js').replaceAll('OjjudaBoard','OjjudaGameRankings');write('tests/'+f,t);}
console.log('Removed retired page integrations and retained arcade rankings.');
for(const f of ['index.html','world.html'])write(f,read(f).split('\n').map(l=>l.trimEnd()).join('\n'));
