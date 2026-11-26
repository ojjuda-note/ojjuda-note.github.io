(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const button=byId('connect'), status=byId('status'), retry=byId('retry');
  const request=location.hash.slice(1);
  const parts=/^([a-f0-9]{64})\.(\d{10})$/.exec(request);
  const valid=()=>window.top===window && parts && Number(parts[2])*1000>Date.now() && Number(parts[2])*1000<=Date.now()+660000;
  let client, member;
  function expired() {
    button.hidden=true;retry.hidden=true;
    status.textContent='Even 앱에서 오쭈다 공원을 열고 ‘공원 계정으로 연결’을 다시 눌러 주세요.';
  }
  async function init() {
    retry.hidden=true;button.hidden=true;byId('account').textContent='';
    if (!valid()) return expired();
    try {
      client=await window.OjjudaGetClient();
      const {data,error}=await client.auth.getSession();
      if(error) throw error;
      member=data.session?.user;
      if(member?.is_anonymous) member=null;
      if(!valid()) return expired();
      if(!member) {
        sessionStorage.setItem('park-g2-return',request);
        location.replace('/?auth=login&next=note');
        return;
      } else {
        sessionStorage.removeItem('park-g2-return');
        byId('account').textContent=member.email || '로그인한 공원 계정';
        status.textContent='이 안경에서 GPT에 음성으로 질문할 수 있어요.';
        button.textContent='내 G2 연결';
      }
      button.hidden=false;
    } catch {status.textContent='공원 계정을 확인하지 못했어요.';retry.hidden=false;}
  }
  button.onclick=async()=>{
    if(!valid()) return expired();
    if(!member) return;
    button.disabled=true;
    try {
      const {data,error}=await client.schema('public').rpc('park_g2_voice_approve',{p_challenge:parts[1],p_until:Number(parts[2])});
      if(error) throw error;
      if(data!==true) return expired();
      button.hidden=true;
      byId('account').textContent='';
      status.textContent='연결을 승인했어요. Even 앱의 오쭈다 공원으로 돌아가면 자동으로 연결돼요.';
    } catch {status.textContent='연결하지 못했어요. 다시 눌러 주세요.';}
    finally {button.disabled=false;}
  };
  retry.onclick=init;
  void init();
})();
