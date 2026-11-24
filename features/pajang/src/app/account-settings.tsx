import {createElement,useEffect,useRef,useState} from "react";
import {I} from "./icons";
import {openAccount,leaveAccount,accountError} from "../lib/account-actions.mjs";
import {watchAdminAccess} from "../lib/admin-access.mjs";
import {openPajangSupport,closePajangSupport} from "../lib/account-support.mjs";
import {client} from "../../member.mjs";

export type AccountAction="logout"|"withdraw";
export type AccountSettingsAction=AccountAction|"edit"|"privateProfile"|"privatePhotos"|"visibility"|"answers"|"buySignals"|"help"|"delete";

export function AccountSettings({profileId,onOpen}:{profileId:string;onOpen:(action:AccountSettingsAction)=>void}){
  const [admin,setAdmin]=useState({owner:"",allowed:false});
  const [supportBusy,setSupportBusy]=useState(false),[supportError,setSupportError]=useState("");
  const supportScope=useRef({profileId,active:true}),openAction=useRef(onOpen);
  openAction.current=onOpen;
  useEffect(()=>{
    const scope={profileId,active:true};supportScope.current=scope;
    setSupportBusy(false);setSupportError("");
    return()=>{scope.active=false;closePajangSupport(scope);};
  },[profileId]);
  async function showSupport(){
    if(supportBusy)return;
    const scope=supportScope.current;
    const isCurrent=()=>scope.active&&supportScope.current===scope&&scope.profileId===profileId;
    setSupportBusy(true);setSupportError("");
    try{await openPajangSupport({owner:scope,isCurrent,onOpen:(action:"withdraw")=>openAction.current(action)});}
    catch{if(isCurrent())setSupportError("문의·의견을 열지 못했어요. 다시 눌러 주세요.");}
    finally{if(isCurrent())setSupportBusy(false);}
  }
  useEffect(()=>{
    let active=true,dispose=()=>{};
    setAdmin({owner:profileId,allowed:false});
    void Promise.resolve().then(()=>client()).then(async db=>{
      // Pajang profile IDs are distinct from Auth user IDs. Pin the current Auth identity.
      const {data,error}=await db.auth.getSession();
      const user=data?.session?.user;
      if(!active||error||!user?.id||user.is_anonymous)return;
      dispose=watchAdminAccess(db,user.id,(allowed:boolean)=>{
        if(active)setAdmin({owner:profileId,allowed});
      });
    }).catch(()=>{if(active)setAdmin({owner:profileId,allowed:false});});
    return()=>{active=false;dispose();};
  },[profileId]);
  const row=(action:AccountSettingsAction,label:string,danger=false)=><button type="button"
    className={"ojjuda-settings-row"+(danger?" ojjuda-settings-danger":"")} onClick={()=>onOpen(action)}>
    <span className="ojjuda-settings-label">{label}</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
  </button>;
  return <section className="ojjuda-settings account-settings" aria-label="파장 설정">
    <section className="ojjuda-settings-group" aria-labelledby="account-profile-title">
      <h2 className="ojjuda-settings-heading" id="account-profile-title">내 계정</h2>
      <div className="ojjuda-settings-list">
        {row("edit","내 프로필 수정")}
        {row("privatePhotos","교환용 사진 관리")}
      </div>
    </section>
    <section className="ojjuda-settings-group" aria-labelledby="account-activity-title">
      <h2 className="ojjuda-settings-heading" id="account-activity-title">내 활동</h2>
      <div className="ojjuda-settings-list">
        {row("visibility","답변 공개 설정")}
        {row("answers","내가 남긴 답변")}
        {row("buySignals","신호 구매")}
        <button type="button" className="ojjuda-settings-row" data-ju-charge-open aria-haspopup="dialog" aria-controls="ju-charge-dialog">
          <span className="ojjuda-settings-label">쭈 충전</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>
    <section className="ojjuda-settings-group" aria-labelledby="account-help-title">
      <h2 className="ojjuda-settings-heading" id="account-help-title">이용 안내</h2>
      <div className="ojjuda-settings-list">
        <button type="button" className="ojjuda-settings-row" onClick={()=>void showSupport()} disabled={supportBusy} aria-haspopup="dialog">
          <span className="ojjuda-settings-label">문의·의견</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
        </button>
        <details className="ojjuda-settings-details">
          <summary className="ojjuda-settings-row"><span className="ojjuda-settings-label">도움말</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span></summary>
          <div className="ojjuda-settings-body">
            {row("help","사용법")}
            <a className="ojjuda-settings-row" href="/features/organization/?from=pajang" target="_top">
              <span className="ojjuda-settings-label">조직도</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
            </a>
          </div>
        </details>
        <a className="ojjuda-settings-row" href="/terms.html?from=pajang">
          <span className="ojjuda-settings-label">이용약관</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
        </a>
        <a className="ojjuda-settings-row" href="/privacy.html?from=pajang">
          <span className="ojjuda-settings-label">개인정보처리방침</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
        </a>
      </div>
      {supportError&&<p className="error" role="alert">{supportError}</p>}
    </section>
    <section className="ojjuda-settings-group" aria-labelledby="account-app-download-title">
      <h2 className="ojjuda-settings-heading" id="account-app-download-title">앱 다운로드</h2>
      <div className="ojjuda-settings-list app-store-downloads">
        <a className="ojjuda-settings-row" data-store-app="agit" href="https://play.google.com/store/apps/details?id=kr.ojjuda.agit&hl=ko" target="_blank" rel="noopener noreferrer" aria-label="오쭈다 아지트 Google Play에서 보기 (새 창)">
          <span className="ojjuda-settings-label">오쭈다 아지트</span><span className="ojjuda-settings-arrow" aria-hidden="true">↗</span>
        </a>
        <a className="ojjuda-settings-row" data-store-app="pajang" href="https://play.google.com/store/apps/details?id=kr.ojjuda.pajang" target="_blank" rel="noopener noreferrer" aria-label="오쭈다 파장 Google Play에서 보기 (새 창)">
          <span className="ojjuda-settings-label">오쭈다 파장</span><span className="ojjuda-settings-arrow" aria-hidden="true">↗</span>
        </a>
        <a className="ojjuda-settings-row" data-store-app="park" href="https://play.google.com/store/apps/details?id=kr.ojjuda.park" target="_blank" rel="noopener noreferrer" aria-label="오쭈다 공원 Google Play에서 보기 (새 창)">
          <span className="ojjuda-settings-label">오쭈다 공원</span><span className="ojjuda-settings-arrow" aria-hidden="true">↗</span>
        </a>
      </div>
      <p className="app-store-note">앱 이름을 누르면 Google Play 페이지가 열립니다. 아지트 비공개 테스트 참여가 필요하면 <a href="https://play.google.com/apps/testing/kr.ojjuda.agit" target="_blank" rel="noopener noreferrer">먼저 참여</a>한 뒤 설치하세요.</p>
    </section>
    <section className="ojjuda-settings-group" aria-labelledby="account-access-title">
      <h2 className="ojjuda-settings-heading" id="account-access-title">계정 관리</h2>
      <div className="ojjuda-settings-list">
        {row("logout","로그아웃")}
        {row("delete","파장 기록 삭제")}
      </div>
    </section>
    {admin.owner===profileId&&admin.allowed&&<section className="ojjuda-settings-group" aria-labelledby="account-admin-title">
      <h2 className="ojjuda-settings-heading" id="account-admin-title">운영 관리</h2>
      <div className="ojjuda-settings-list">
        <a className="ojjuda-settings-row" href="/world.html?admin=pajang-answers&from=pajang" target="_top">
          <span className="ojjuda-settings-label">파장 관리자모드</span><span className="ojjuda-settings-arrow" aria-hidden="true">›</span>
        </a>
      </div>
    </section>}
    {createElement("ojjuda-service-banners", {current:"pajang"})}
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
