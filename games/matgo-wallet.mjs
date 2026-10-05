const messages={match_in_progress:'회원 대결이 진행 중이에요. 대결을 마친 뒤 다시 시작해 주세요.',adult_required:'맞고는 만 19세 이상만 이용할 수 있어요.',member_identity_required:'내 정보에서 생년월일을 등록해 주세요.',not_signed_in:'다시 로그인해 주세요.',banned:'이용이 제한된 계정이에요.',no_account:'회원 지갑을 확인하지 못했어요.',gold_not_empty:'골드가 0일 때 충전할 수 있어요.',gold_empty:'골드를 충전한 뒤 시작해 주세요.',insufficient_zzu:'쭈가 부족해요. 충전에는 5쭈가 필요해요.',paid_confirmation_required:'무료 리필을 모두 사용했어요. 5쭈 충전을 선택해 주세요.',round_mismatch:'다른 창에서 게임이 진행됐어요. 새로고침해 주세요.',invalid_round:'게임 결과를 확인하지 못했어요. 다시 저장해 주세요.'};
import {waitForMatgoStart} from './matgo-start.mjs?v=20261005-sound1';
export function createWallet(access) {
  let current=null,pendingRefill=null;
  async function request(body) {
    const client=access.getClient();
    const {data,error}=await client.functions.invoke('matgo',{body});
    let code=data?.error;
    if(error){try{code=(await error.context.json()).error;}catch{}}
    if(error||code||!data?.ok){const failure=new Error(messages[code]||'서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');failure.code=code||'unavailable';throw failure;}
    current=data;
    if(body.action==='refill'&&Number.isInteger(data.coins)){
      const message={type:'ojjuda:matgo:wallet',coins:data.coins};
      if(window.parent!==window)window.parent.postMessage(message,location.origin);
    }
    return data;
  }
  return {
    request,status:()=>request({action:'status'}),
    async start(){
      await waitForMatgoStart();
      // The player may have signed out while the start screen was open.
      await access.check();
      return request({action:'start'});
    },
    settle:(roundId,actions)=>request({action:'settle',round_id:roundId,actions,rules_version:5}),
    refill(paid){
      // Retain the request ID through network failures so retries cannot charge twice.
      if(!pendingRefill||pendingRefill.paid!==paid)pendingRefill={action:'refill',request_id:crypto.randomUUID(),paid};
      return request(pendingRefill).then(data=>{pendingRefill=null;return data;});
    },
    get current(){return current;}
  };
}
