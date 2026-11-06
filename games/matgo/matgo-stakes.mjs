// The server supplies both the eligible offer and the saved selection.
export function askStake(state){
  return new Promise(resolve=>{
    const panel=document.createElement('div');
    panel.className='modal';panel.id='matgo-stake';panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','matgo-stake-title');
    panel.setAttribute('aria-describedby','matgo-stake-detail');
    panel.innerHTML='<div class="card"><h2 id="matgo-stake-title">판돈을 올릴까요?</h2><p id="matgo-stake-balance"></p><p id="matgo-stake-amount" style="font-size:22px;font-weight:700"></p><p id="matgo-stake-detail">다음 판부터 적용해요.<br>올린 판돈은 계속 유지되고, 골드를 모두 잃으면 점당 100G로 돌아가요.<br>회원 대결은 두 사람이 동의한 금액 중 낮은 금액을 함께 써요.</p><div class="row"><button type="button" class="btn gold" id="matgo-stake-raise">올리기</button><button type="button" class="btn g" id="matgo-stake-keep">유지하기</button></div></div>';
    const offer=state.stake_offer,format=n=>Number(n).toLocaleString('ko-KR');
    panel.querySelector('#matgo-stake-balance').textContent=`보유 ${format(state.gold)}G · ${format(offer.threshold)}G 단계`;
    panel.querySelector('#matgo-stake-amount').textContent=`점당 ${format(state.stake_rate)}G → ${format(offer.rate)}G`;
    const raise=panel.querySelector('#matgo-stake-raise'),keep=panel.querySelector('#matgo-stake-keep');
    const previous=document.activeElement;
    const finish=accept=>{panel.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(accept);};
    raise.onclick=()=>finish(true);keep.onclick=()=>finish(false);
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}
      if(event.key==='Tab'){event.preventDefault();(document.activeElement===keep?raise:keep).focus();}
    });
    document.body.append(panel);keep.focus({preventScroll:true});
  });
}
