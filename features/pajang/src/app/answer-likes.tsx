import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from "react";
import {openAccount} from "../lib/account-actions.mjs";
import type {Slot} from "../lib/station";
import {I} from "./icons";

export type LikeAnswer={peer:string;day:string;slot:Slot;liked?:boolean;likeCount?:number};
type Account=Awaited<ReturnType<typeof openAccount>>;
type LikeState={liked:boolean;likeCount:number;pending:boolean;ready:boolean;error:string};
type Entry={state:LikeState;changed:number};
const keyOf=(answer:LikeAnswer)=>answer.peer+"/"+answer.day+"/"+answer.slot;
const countOf=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:0;

// One member-scoped store keeps carousel copies, profile dialogs and My Answers in sync.
// A response from a read started before a mutation cannot undo that mutation.
function createLikes(expectedPerson:string){
  const entries=new Map<string,Entry>(),listeners=new Set<()=>void>(),requests=new Set<AbortController>();
  let account:Account|null=null,alive=true,blocked=false,version=0;
  const notify=()=>{for(const listener of listeners)listener();};
  function entry(answer:LikeAnswer){
    const key=keyOf(answer);
    let value=entries.get(key);
    if(!value){
      value={state:{liked:answer.liked===true,likeCount:countOf(answer.likeCount),pending:false,ready:!!account&&!blocked,error:""},changed:0};
      entries.set(key,value);
    }
    return value;
  }
  function invalidate(){
    if(!alive)return;
    blocked=true;account?.dispose();account=null;
    for(const controller of requests)controller.abort();
    for(const item of entries.values())item.state={...item.state,ready:false,pending:false,
      error:item.state.pending?"계정이 바뀌었어요. 다시 열어 주세요.":item.state.error};
    notify();
  }
  return {
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    snapshot(answer:LikeAnswer){return entry(answer).state;},
    checkpoint(){return version;},
    hydrate(answers:LikeAnswer[],started:number){
      if(!alive||blocked)return;
      let changed=false;
      for(const answer of answers){
        const item=entry(answer);
        if(item.state.pending||item.changed>started)continue;
        const liked=typeof answer.liked==="boolean"?answer.liked:item.state.liked;
        const likeCount=typeof answer.likeCount==="number"?countOf(answer.likeCount):item.state.likeCount;
        if(liked!==item.state.liked||likeCount!==item.state.likeCount){
          item.state={...item.state,liked,likeCount};changed=true;
        }
      }
      if(changed)notify();
    },
    async connect(){
      try{
        const next=await openAccount(false,invalidate);
        if(!alive||blocked){next.dispose();return;}
        account=next;
        for(const item of entries.values())item.state={...item.state,ready:true};
        notify();
      }catch{if(alive){for(const item of entries.values())item.state={...item.state,ready:false};notify();}}
    },
    dispose(){alive=false;account?.dispose();account=null;for(const controller of requests)controller.abort();listeners.clear();},
    async toggle(answer:LikeAnswer){
      const item=entry(answer),owner=account;
      if(!alive||blocked||!owner||!owner.isCurrent()||item.state.pending)return;
      const wanted=!item.state.liked;
      item.changed=++version;item.state={...item.state,pending:true,error:""};notify();
      const controller=new AbortController();requests.add(controller);
      const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const identity=await owner.db.auth.getSession();
        if(!alive||!owner.isCurrent())throw Error("account_changed");
        if(identity.error)throw identity.error;
        const session=identity.data?.session;
        if(session?.user?.id!==owner.userId||session.user.is_anonymous||!session.access_token)throw Error("account_changed");
        const {data,error}=await owner.db.rpc("pajang_answer_like",{
          p_peer:answer.peer,p_day:answer.day,p_slot:answer.slot,p_liked:wanted,p_expected_person:expectedPerson
        }).setHeader("Authorization",`Bearer ${session.access_token}`).abortSignal(controller.signal);
        if(!alive||!owner.isCurrent())throw Error("account_changed");
        if(error)throw error;
        if(data?.peer!==answer.peer||data?.day!==answer.day||data?.slot!==answer.slot||typeof data?.liked!=="boolean"||
          !Number.isSafeInteger(data?.likeCount)||data.likeCount<0)throw Error("invalid_like_response");
        item.changed=++version;item.state={...item.state,liked:data.liked,likeCount:data.likeCount,pending:false,error:""};notify();
      }catch(cause){
        if(!alive)return;
        if(!owner.isCurrent()||(cause as Error)?.message==="account_changed"){invalidate();return;}
        const code=(cause as {code?:string})?.code;
        item.changed=++version;item.state={...item.state,pending:false,error:code==="PT409"||code==="42501"
          ?"이 답변에 좋아요를 남길 수 없어요.":"저장하지 못했어요. 다시 눌러 주세요."};notify();
      }finally{clearTimeout(timeout);requests.delete(controller);}
    }
  };
}
type Likes=ReturnType<typeof createLikes>;
const LikesContext=createContext<Likes|null>(null);
export const useAnswerLikes=()=>useContext(LikesContext);
export function AnswerLikesProvider({children,owner}:{children:ReactNode;owner:string}){
  const [likes]=useState(()=>createLikes(owner));
  useEffect(()=>{void likes.connect();return()=>likes.dispose();},[likes]);
  return <LikesContext.Provider value={likes}>{children}</LikesContext.Provider>;
}
const offline:LikeState={liked:false,likeCount:0,pending:false,ready:false,error:""};
const noSubscription=()=>()=>{};
export function AnswerLike({answer}:{answer:LikeAnswer}){
  const likes=useAnswerLikes();
  const state=useSyncExternalStore(likes?.subscribe??noSubscription,()=>likes?.snapshot(answer)??offline);
  return <div className="answer-like-wrap">
    <button type="button" className="answer-like" aria-pressed={state.liked}
      aria-label={`좋아요 ${state.likeCount}개${state.liked?", 취소하기":""}`} aria-busy={state.pending}
      disabled={!state.ready||state.pending} onClick={()=>void likes?.toggle(answer)}>
      <I n="heart" s={17}/><b>{state.likeCount}</b>
    </button>
    {state.error&&<span className="answer-like-error" role="status">{state.error}</span>}
  </div>;
}
