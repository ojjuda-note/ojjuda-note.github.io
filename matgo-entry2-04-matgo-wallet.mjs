const messages={client_update_required:'맞고가 업데이트됐어요. 새로고침한 뒤 시작해 주세요.',round_in_progress:'진행 중인 판을 마친 뒤 다시 시도해 주세요.',stake_offer_pending:'판돈 선택을 확인한 뒤 다시 시작해 주세요.',stake_offer_changed:'다른 창에서 판돈 상태가 바뀌었어요. 다시 시작해 주세요.',match_in_progress:'회원 대결이 진행 중이에요. 대결을 마친 뒤 다시 시작해 주세요.',adult_required:'맞고는 만 19세 이상만 이용할 수 있어요.',member_identity_required:'내 정보에서 생년월일을 등록해 주세요.',not_signed_in:'다시 로그인해 주세요.',banned:'이용이 제한된 계정이에요.',no_account:'회원 지갑을 확인하지 못했어요.',gold_not_empty:'골드가 1,000G 미만일 때 충전할 수 있어요.',gold_empty:'골드를 충전한 뒤 시작해 주세요.',insufficient_zzu:'ZU가 부족해요. 충전에는 5 ZU가 필요해요.',paid_confirmation_required:'무료 리필을 모두 사용했어요. 5 ZU 충전을 선택해 주세요.',round_mismatch:'다른 창에서 게임이 진행됐어요. 새로고침해 주세요.',invalid_round:'게임 결과를 확인하지 못했어요. 다시 저장해 주세요.'};
import {waitForMatgoStart} from './matgo-start.mjs?v=20261029-matgo-entry2';
export function createWallet(access,{stakes=false}={}) {
  let current=null,pendingRefill=null,pendingTazza=null,pendingVent=null,ventRequest=null;
  const roundVersions=new Map();
  const purchaseMessages={purchase_mismatch:'결제 정보를 다시 확인해 주세요.',purchase_completed:'이미 마친 판의 결제예요. 새로고침해 주세요.',no_active_round:'진행 중인 판에서 사용할 수 있어요.',invalid_purchase:'사용 정보를 확인하지 못했어요.'};
  async function request(body) {
    const client=access.getClient();
    const {data,error}=await client.functions.invoke('matgo',{body});
    let code=data?.error;
    if(error){try{code=(await error.context.json()).error;}catch{}}
    if(error||code||!data?.ok){const failure=new Error(code==='insufficient_zzu'?`쭈가 부족해요. ${body.action==='vent'?'화풀이는 1쭈':body.action==='tazza_start'?'타짜모드는 5쭈':'충전은 5쭈'}가 필요해요.`:purchaseMessages[code]||messages[code]||'서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');failure.code=code||'unavailable';throw failure;}
    current=data;
    if(data.round?.id)roundVersions.set(data.round.id,data.round.rules_version??(data.round.cpu_level==null?10:11));
    if(Number.isInteger(data.coins)){
      const message={type:'ojjuda:matgo:wallet',coins:data.coins};
      if(window.parent!==window)window.parent.postMessage(message,location.origin);
    }
    return data;
  }
  async function prepareStake(){
    await access.check();
    return request({action:'status'});
  }
  return {
    request,prepareStake,status:()=>request({action:'status'}),
    async start({tazza=false}={}){
      await waitForMatgoStart();
      // The player may have signed out while the start screen was open.
      await access.check();
      if(stakes)await prepareStake();
      if(tazza){
        pendingTazza??={action:'tazza_start',request_id:crypto.randomUUID(),stakes_version:1,rules_version:13};
        try{const state=await request(pendingTazza);pendingTazza=null;return state;}
        catch(error){if(error.code&&error.code!=='unavailable')pendingTazza=null;throw error;}
      }
      const state=await request({action:'start',rules_version:13,...(stakes?{stakes_version:1}:{})});
      pendingTazza=null;return state;
    },
    vent(referenceId,effect){
      if(ventRequest)return ventRequest;
      // Retry the same purchase after an uncertain response, including its animation.
      pendingVent??={action:'vent',request_id:crypto.randomUUID(),reference_id:referenceId,effect};
      ventRequest=request(pendingVent).then(data=>{pendingVent=null;return data;}).catch(error=>{if(error.code&&error.code!=='unavailable')pendingVent=null;throw error;}).finally(()=>{ventRequest=null;});
      return ventRequest;
    },
    settle:(roundId,actions)=>request({action:'settle',round_id:roundId,actions,rules_version:roundVersions.get(roundId)??13}),
    refill(paid){
      // Retain the request ID through network failures so retries cannot charge twice.
      if(!pendingRefill||pendingRefill.paid!==paid)pendingRefill={action:'refill',request_id:crypto.randomUUID(),paid};
      return request(pendingRefill).then(data=>{pendingRefill=null;return data;});
    },
    get current(){return current;}
  };
}
