import {useEffect,useRef,useState} from "react";
import {I} from "./icons";
import {openAccount,leaveAccount,accountError} from "../lib/account-actions.mjs";

export type AccountAction="logout"|"withdraw";

export function AccountSettings({onHelp,onAction}:{onHelp:()=>void;onAction:(action:AccountAction)=>void}){
  return <section className="account-section account-settings" aria-labelledby="account-settings-title">
    <h2 id="account-settings-title">기본 설정</h2>
    <div className="account-menu">
      <button type="button" onClick={onHelp}><I n="info"/><span>이용 안내</span><I n="right" s={16}/></button>
      <a href="/terms.html?from=pajang" target="_top"><I n="document"/><span>이용약관</span><I n="right" s={16}/></a>
      <a href="/privacy.html?from=pajang" target="_top"><I n="shield"/><span>개인정보처리방침</span><I n="right" s={16}/></a>
      <button type="button" onClick={()=>onAction("logout")}><I n="logout"/><span>로그아웃</span><I n="right" s={16}/></button>
      <button type="button" className="account-withdraw" onClick={()=>onAction("withdraw")}><I n="user-minus"/><span>회원탈퇴</span><I n="right" s={16}/></button>
    </div>
  </section>;
}

export function AccountActionForm({action,close,onBusyChange}:{action:AccountAction;close:()=>void;onBusyChange:(busy:boolean)=>void}){
  const withdraw=action==="withdraw";
  const [account,setAccount]=useState<Awaited<ReturnType<typeof openAccount>>|null>(null);
  const [nickname,setNickname]=useState(""),[consent,setConsent]=useState(false);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const locked=useRef(false),active=useRef(true);
  useEffect(()=>{
    let cancelled=false,dispose=()=>{};
    active.current=true;setAccount(null);setError("");setNickname("");setConsent(false);
    void openAccount(withdraw,()=>{
      if(!cancelled){setAccount(null);setError(accountError(new Error('account_changed')));}
    }).then(value=>{
      if(cancelled){value.dispose();return;}
      dispose=value.dispose;setAccount(value);
    }).catch(error=>{if(!cancelled)setError(['account_changed','profile_unavailable'].includes(error?.message)
      ?accountError(error):'계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');});
    return()=>{cancelled=true;active.current=false;dispose();};
  },[withdraw,attempt]);
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(locked.current||!account||(withdraw&&(!consent||nickname.trim()!==account.nickname)))return;
    locked.current=true;setBusy(true);setError("");onBusyChange(true);
    try{await leaveAccount(account,withdraw);}
    catch(error){if(active.current)setError(accountError(error,withdraw));}
    finally{
      locked.current=false;onBusyChange(false);
      if(active.current)setBusy(false);
    }
  }
  return <form className="account-action-form" onSubmit={event=>void submit(event)} aria-busy={busy}>
    <span className="modalicon"><I n={withdraw?"user-minus":"logout"}/></span>
    <h2>{withdraw?"오쭈다 회원탈퇴":"로그아웃할까요?"}</h2>
    {withdraw?<>
      <p className="sub account-warning">오쭈다 통합 계정을 탈퇴해요. 아지트·공원·파장 기록과 사진, 보유 ZU가 삭제되며 되돌릴 수 없어요.</p>
      <p className="account-retention">계정정보는 1개월간 비공개 보관 후 삭제해요. 3일(72시간) 동안 같은 이메일·전화번호로 재가입할 수 없으며, 다른 사람의 방명록·댓글에는 ‘탈퇴한 사용자’로 남아요.</p>
    </>:<p className="sub">이 기기에서 아지트·공원·파장이 함께 로그아웃돼요.</p>}
    {!account&&!error&&<p className="sub" role="status">계정을 확인하고 있어요.</p>}
    {withdraw&&account&&<>
      <label className="formlabel" htmlFor="withdraw-nickname">확인을 위해 닉네임 ‘{account.nickname}’을 입력해 주세요.</label>
      <input id="withdraw-nickname" className="account-confirm-input" value={nickname} onChange={event=>setNickname(event.target.value)} autoComplete="off" disabled={busy} required/>
      <label className="account-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy} required/><span>오쭈다 통합 계정 탈퇴와 삭제 내용을 확인했어요.</span></label>
    </>}
    {error&&<p role="alert" className="error">{error}</p>}
    {!account&&error&&<button type="button" className="secondary wide" onClick={()=>setAttempt(n=>n+1)}>다시 확인</button>}
    <div className="account-action-buttons">
      <button type="button" className="secondary" disabled={busy} onClick={close}>취소</button>
      <button type="submit" className={"primary"+(withdraw?" account-danger":"")} disabled={busy||!account||(withdraw&&(!consent||nickname.trim()!==account.nickname))}>
        {busy?(withdraw?"탈퇴 처리 중…":"로그아웃 중…"):(withdraw?"회원탈퇴":"로그아웃")}
      </button>
    </div>
  </form>;
}
