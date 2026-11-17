import type { RadarBand } from "./radar";
import { koreaDay, interests, themeFor, signalsWith, type Person, type Station, type Signal, type Message } from "./station";
export type DemoRecord={version:1;me:Person;answers:Record<string,string>;sent:Signal[];messages:Message[];blocked:string[]};
const key="pajang.sample.v1";
const names=["바늘소리","오후의 모카","초록걸음","빛수집가","책갈피","랠리메이트"];
const areas=["마포구","성동구","마포구","종로구","용산구","서대문구"];
export function newDemo():DemoRecord{return {version:1,me:{id:"demo-me",name:"새벽라디오",age:27,region:"마포구",interest:"vinyl"},answers:{},sent:[],messages:[],blocked:[]};}
export function readDemo(){
  try{const d=JSON.parse(localStorage.getItem(key)||"null");if(d?.version===1 && d.me?.id==="demo-me" && d.answers && Array.isArray(d.sent)&&Array.isArray(d.messages)&&Array.isArray(d.blocked))return d as DemoRecord;}catch{}
  return newDemo();
}
export function saveDemo(d:DemoRecord){localStorage.setItem(key,JSON.stringify(d));}
export function viewDemo(d:DemoRecord,day=koreaDay()):Station{
  const t=themeFor(day),base=Date.parse(day+"T00:00:00+09:00");
  const people=interests.map((it,i)=>({id:"demo-"+i,name:names[i],age:[28,26,30,29,27,31][i],region:areas[i],interest:it.key,body:t.answers[i],bearing:[0,90,315,225,135,45][i],range:([1,3,7,15,3,15] as RadarBand[])[i],at:base+1000*(60-i)})).filter(p=>!d.blocked.includes(p.id));
  const incoming=[0,3].map((v,i)=>({src:"demo-"+v,dst:d.me.id,day,at:base+i,note:["취향 이야기를 조금 더 나눠보고 싶어요.","어떤 순간을 좋아하는지 궁금해요."][i]}));
  return {day,authenticated:false,radarOn:true,remaining:Math.max(0,3-d.sent.filter(x=>x.day===day).length),me:{...d.me,body:d.answers[day]},people,signals:[...incoming,...d.sent].filter(x=>!d.blocked.includes(x.src)&&!d.blocked.includes(x.dst)),messages:d.messages.filter(x=>!d.blocked.includes(x.src)&&!d.blocked.includes(x.dst))};
}
export function demoAction(d:DemoRecord, action:string, b:Record<string,any>):DemoRecord{
  const out=structuredClone(d),s=viewDemo(out),day=s.day,now=Date.now(),id=out.me.id;
  if(action==="answer"){if(b.day!==day || !b.body.trim() || b.body.trim().length>220)throw Error("오늘의 질문에 답을 1~220자로 적어 주세요.");out.answers[day]=b.body.trim();}
  if(action==="profile"){if(!b.name?.trim()||b.name.trim().length>12||!Number.isInteger(b.age)||b.age<19||b.age>110)throw Error("닉네임과 만 19세 이상 나이를 확인해 주세요.");out.me={...out.me,name:b.name.trim(),age:b.age,region:b.region,interest:b.interest};}
  if(action==="delete") return newDemo();
  const peer=s.people.find(p=>p.id===b.peer);
  if(["signal","message","block"].includes(action)&&!peer)throw Error("이 프로필을 찾을 수 없어요.");
  if(action==="signal" && peer){
    if(!out.answers[day])throw Error("오늘의 답을 먼저 적어 주세요.");
    if(signalsWith(s,peer.id).outgoing)return out;
    if(out.sent.filter(x=>x.day===day).length>=3)throw Error("오늘 보낼 수 있는 신호를 모두 썼어요.");
    out.sent.push({src:id,dst:peer.id,day,at:now,note:(b.note||"").trim().slice(0,120)});
  }
  if(action==="message" && peer){
    if(!signalsWith(s,peer.id).match)throw Error("서로 신호를 보내야 대화할 수 있어요.");
    if(!b.body.trim() || b.body.length>500)throw Error("메시지를 1~500자로 적어 주세요.");
    if(out.messages.some(x=>x.id===b.id)) return out;
    const count=out.messages.filter(x=>x.src===peer.id).length;
    out.messages.push({id:b.id,src:id,dst:peer.id,at:now,body:b.body.trim()});
    const replies=["반가워요! 오늘의 답을 읽고 이야기를 나눠보고 싶었어요.", "그렇군요. 요즘 가장 자주 찾는 곳도 궁금해요.", "그 이야기를 들으니 저도 다음 주말이 기대돼요."];
    if(count<replies.length)out.messages.push({id:b.id+"-reply",src:peer.id,dst:id,at:now+1,body:replies[count]});
  }
  if(action==="block"&&peer)out.blocked.push(peer.id);
  return out;
}
