const assert=require("node:assert/strict");
const {test}=require("node:test");
const {createRequire}=require("node:module");
const path=require("node:path");
const {JSDOM}=require("jsdom");

const pajang=path.resolve(__dirname,"../features/pajang");
const {build}=createRequire(path.join(pajang,"package.json"))("esbuild");
const clone=value=>JSON.parse(JSON.stringify(value));
let built;
const turn=()=>new Promise(resolve=>setTimeout(resolve,12));
async function waitFor(predicate,label){
  const until=Date.now()+2500;
  do{if(predicate())return;await turn();}while(Date.now()<until);
  assert.ok(predicate(),label);
}
async function bundle(){
  const source=[
    'import {createRoot} from "react-dom/client";',
    'import {ChatExchange} from "./src/app/chat-exchange";',
    'let root,version=0;',
    'window.exchangeMount=()=>{root=createRoot(document.getElementById("root"));window.exchangeRefresh();};',
    'window.exchangeRefresh=()=>{',
    'root.render(<ChatExchange peer={window.exchangePeer} name="상대" lastMessage={String(++version)}>',
    '{({notification,actions})=><>',
    '<div className="chatbox"><div className="chatheader">대화 상대</div>',
    '<div className="chatlog"><p className="bubbleline">대화 내용</p>{notification}</div>',
    '<div className="composer">메시지 입력</div></div>',
    '{actions}</>}</ChatExchange>);};',
    'window.exchangeUnmount=()=>root?.unmount();',
    'window.exchangeMount();',
  ].join("\n");
  built??=build({stdin:{contents:source,resolveDir:pajang,loader:"tsx"},
    bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",
    define:{"process.env.NODE_ENV":'"production"'}}).then(result=>result.outputFiles[0].text);
  return built;
}
async function fixture(t,options={}){
  const dom=new JSDOM("<!doctype html><div id=\"root\"></div>",{
    url:"https://ojjuda.kr/features/pajang/station.html?tab=chat",
    runScripts:"outside-only",pretendToBeVisual:true,
  });
  const w=dom.window;
  const state={myCount:options.myCount??0,peerCount:options.peerCount??0,
    eligible:options.eligible??false,profile:options.profile??"none",
    photos:options.photos??"none",peerProfile:null};
  const calls=[];
  w.exchangePeer="22222222-2222-4222-8222-222222222222";
  w.OjjudaGetClient=async()=>({
    rpc:async(name,args)=>{
      assert.equal(name,"pajang_exchange");
      calls.push(clone(args));
      assert.equal(args.p_peer,w.exchangePeer);
      if(args.p_action==="state")return {data:clone(state),error:null};
      if(!state.eligible)return {data:null,error:{code:"42501",message:"아직 교환할 수 없어요."}};
      const kind=args.p_kind;
      assert.ok(kind==="profile"||kind==="photos");
      const before=state[kind];
      const allowed={request:"none",accept:"received",decline:"received",withdraw:"sent",revoke:"accepted"};
      if(before!==allowed[args.p_action])return {data:null,error:{code:"42501",message:"상태가 변경됐어요."}};
      state[kind]=({request:"sent",accept:"accepted",decline:"none",withdraw:"none",revoke:"none"})[args.p_action];
      return {data:clone(state),error:null};
    },
  });
  w.eval(await bundle());
  t.after(()=>{w.exchangeUnmount?.();w.close();});
  const buttons=()=>[...w.document.querySelectorAll("button")];
  const button=name=>buttons().find(b=>b.textContent.trim()===name);
  const request=()=>w.document.querySelector(".exchange-chat-request");
  await waitFor(()=>calls.some(row=>row.p_action==="state"),"exchange state loaded");
  return {w,state,calls,button,request,refresh:()=>w.exchangeRefresh()};
}

test("compact buttons and profile fraud warning appear only after 5 + 5 messages",async t=>{
  const f=await fixture(t,{myCount:4,peerCount:5,eligible:false});
  assert.equal(f.w.document.querySelector(".chat-exchange-actions"),null);
  assert.equal(f.request(),null);
  f.state.myCount=5;f.state.eligible=true;f.refresh();
  await waitFor(()=>!!f.button("프로필 교환")&&!!f.button("사진 교환"),"both buttons appear at threshold");
  const actions=f.w.document.querySelector(".chat-exchange-actions");
  const parent=f.w.document.querySelector(".chatbox");
  assert.equal(parent.contains(actions),false,"buttons are beneath the chat box");
  assert.ok(parent.compareDocumentPosition(actions)&f.w.Node.DOCUMENT_POSITION_FOLLOWING);
  const caution=actions.querySelector(".chat-exchange-safety");
  assert.ok(caution,"member-submitted information carries a visible warning");
  assert.match(caution.textContent,/회원이 직접 작성한 미검증 정보/);
  assert.match(caution.textContent,/실제와 다를 수 있으니 사기·금전 요구에 주의하세요/);
  assert.ok(actions.querySelector(".chat-exchange-choices").compareDocumentPosition(caution)&
    f.w.Node.DOCUMENT_POSITION_FOLLOWING,"warning is below both buttons");
  f.button("프로필 교환").click();
  await waitFor(()=>f.state.profile==="sent","profile request persisted");
  assert.equal(f.calls.filter(row=>row.p_action==="request"&&row.p_kind==="profile").length,1);
  await waitFor(()=>!!f.button("프로필 신청 취소"),"outgoing request has a cancel action");
  await waitFor(()=>!!f.request(),"sender request appears within chat");
  assert.match(f.request().textContent,/상대에게 프로필 교환을 신청하였습니다/);
  assert.match(f.request().textContent,/상대의 승인을 기다리고 있어요/);
  assert.ok(f.w.document.querySelector(".chatlog").contains(f.request()));
  assert.ok(f.request().classList.contains("exchange-chat-sent"));
  assert.equal(f.button("승인"),undefined,"the sender cannot approve their own request");
  assert.equal(f.button("거부"),undefined,"the sender cannot refuse their own request");
  f.refresh();
  await waitFor(()=>f.calls.filter(row=>row.p_action==="state").length>=3,"status remains server-backed");
  assert.match(f.request().textContent,/상대에게 프로필 교환을 신청하였습니다/);
  f.button("프로필 신청 취소").click();
  await waitFor(()=>f.state.profile==="none","sender can withdraw before approval");
  await waitFor(()=>f.request()===null,"withdrawn request no longer appears in chat");
});

test("received profile request appears within chat and requires explicit approval",async t=>{
  const f=await fixture(t,{myCount:5,peerCount:5,eligible:true,profile:"received"});
  await waitFor(()=>f.request()!==null,"incoming chat request is visible");
  assert.match(f.request().textContent,/상대가 프로필 교환을 신청하였습니다/);
  assert.ok(f.w.document.querySelector(".chatlog").contains(f.request()),"request is in chat");
  assert.equal(f.w.document.querySelector(".chatheader").contains(f.request()),false);
  assert.ok(f.button("승인")&&f.button("거부"));
  assert.equal(f.state.peerProfile,null,"no profile data before approval");
  f.button("승인").click();
  await waitFor(()=>f.state.profile==="accepted","profile was approved");
  await waitFor(()=>f.request()===null,"accepted card disappears");
  assert.ok(f.button("상대 프로필 보기"),"approved profile is available");
  assert.equal(f.calls.filter(row=>row.p_action==="accept"&&row.p_kind==="profile").length,1);
});

test("photo requests can be refused without granting access",async t=>{
  const f=await fixture(t,{myCount:5,peerCount:5,eligible:true,photos:"received"});
  await waitFor(()=>f.request()!==null,"incoming photo notice is visible");
  assert.match(f.request().textContent,/상대가 사진 교환을 신청하였습니다/);
  f.button("거부").click();
  await waitFor(()=>f.state.photos==="none","photo request refused");
  await waitFor(()=>f.request()===null,"refused card removed");
  assert.equal(f.button("상대 사진 보기"),undefined);
  await waitFor(()=>!!f.button("사진 교환"),"photo exchange can be requested again");
  assert.equal(f.calls.filter(row=>row.p_action==="decline"&&row.p_kind==="photos").length,1);
});
test("sender sees photo exchange confirmation in chat and can cancel without approval",async t=>{
  const f=await fixture(t,{myCount:5,peerCount:5,eligible:true});
  await waitFor(()=>!!f.button("사진 교환"),"photo button appears");
  f.button("사진 교환").click();
  await waitFor(()=>f.state.photos==="sent","photo request saved");
  await waitFor(()=>!!f.request(),"outgoing photo notice appears");
  assert.match(f.request().textContent,/상대에게 사진 교환을 신청하였습니다/);
  assert.ok(f.w.document.querySelector(".chatlog").contains(f.request()));
  assert.equal(f.button("승인"),undefined);
  assert.equal(f.button("거부"),undefined);
  f.button("사진 신청 취소").click();
  await waitFor(()=>f.state.photos==="none","photo request withdrawn");
  await waitFor(()=>f.request()===null,"no sender notice after cancel");
});
