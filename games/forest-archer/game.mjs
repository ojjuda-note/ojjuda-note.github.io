// unchanged production source at line 1
  const description=(cleared?'목표를 달성했어요. 이어 할 단계를 골라주세요.':`목표 ${state.stage.goal}점에 도달하지 못했어요. 지금 단계에 다시 도전해 보세요.`);
  const metrics=`<div><small>이번 점수</small><strong>${state.score}</strong><em>/ ${roundMaxScore()}</em></div><div><small>명중 발수</small><strong>${state.arrowHits}</strong><em>/ ${roundMaxScore()/10}발</em></div>`;
  const note=(bonus?`목표 달성 보너스 ${bonus}코인이 포함되어 있어요.`:'이번에 얻은 코인은 그대로 남아 있어요.');
  openModal('result',`<div class="result-content"><div class="result-emblem">${icon(passed?'target':'wind')}</div><p class="eyebrow">YOUR NEXT SHOT</p><h2 id="modalTitle">${title}</h2><p>${description}</p><div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><div class="result-metrics">${metrics}<div><small>${('획득 코인')}</small><strong>+${state.earned}</strong></div></div>${stageChoiceMarkup('result-actions stage-result-actions')}<button type="button" class="button primary-button result-shop-button" data-action="result-shop">${icon('bag')}<span><strong>장비 구매</strong><small>활 · 화살 · 조준경 · 코인</small></span>${icon('arrow')}</button><p class="result-note">${note}</p>${ammo?.pending?'<button class="button soft-button" data-action="retry-ammo">이전 처리 다시 확인</button>':''}<button class="text-button" data-action="menu">메뉴</button></div>`,true);
  const content=window.OjjudaGameResults&&$('modalContent').querySelector?.('.result-content');
  if((window.OjjudaGameResults)&&content){
    const extra=[...content.querySelectorAll('[data-action="retry-ammo"]')];
    window.OjjudaGameResults.decorate(content,{game:'archery',outcome:cleared?'success':'failure',metric:`${level}단계 · ${state.score} / ${state.stage.goal}점`,score:state.score,key:state.runId,actions:[content.querySelector('.stage-result-actions'),content.querySelector('[data-action="result-shop"]')],extra});
    const heading=content.querySelector('h2');if(heading)$('modal').setAttribute('aria-labelledby',heading.id);
    content.querySelector('[data-action="retry"]')?.focus();
  }
// unchanged production source at line 1370
  const route=action('stages','grid','전체 단계',(`${progress.unlocked}단계까지 열림 · 클리어한 판 다시 하기`));
  const subtitle=(`지금 ${level}단계 · ${usingGun()?'총 10발':'활·석궁 5회'} 사격`);
  const coachSetting=`<button class="menu-action" data-action="toggle-coach" aria-pressed="${progress.coachEnabled}">${icon('target')}<span><strong>코치 ${progress.coachEnabled?'켜짐':'꺼짐'}</strong><small>무료 기본 기능 · 눌러서 ${progress.coachEnabled?'끄기':'켜기'}</small></span></button>`;
  openModal('menu',`<div class="game-menu"><p class="eyebrow">TAKE YOUR NEXT SHOT</p><h2 id="modalTitle">게임 메뉴</h2><p class="modal-subtitle">${subtitle}</p>${choices}<div class="menu-actions">${route}${action('weapons','bag','무기 상점',('활 10종 · 석궁 10종 · 총 3종 · 총알 4종'))}${action('stabilizers','tonic','안정제',(`${progress.stabilizers}개 보유 · 이번 판 떨림 50%`))}<button class="menu-action" data-action="toggle-sound" aria-pressed="${progress.sound}">${icon(progress.sound?'sound':'mute')}<span><strong>소리 ${progress.sound?'켜짐':'꺼짐'}</strong><small>눌러서 ${progress.sound?'끄기':'켜기'}</small></span></button>${coachSetting}${action('help','help','게임 방법','조준·장비·발사각 안내')}</div><button class="button primary-button" data-action="close">${finished?'결과로 돌아가기':'게임 계속하기'}</button></div>`,true);
}
function showStages(){
  if(guardAmmoAction())return;
// unchanged production source at line 1383
  if(btn.dataset.stageRange)$(`stage-range-${btn.dataset.stageRange}`)?.scrollIntoView?.({block:'start',behavior:'smooth'});
  if(btn.dataset.stage){if(state.mode==='flight'||state.mode==='settling'){toast('이번 화살이 도착하면 이동할 수 있어요.');return;}startStage(+btn.dataset.stage);}
  const act=btn.dataset.action;
  if(act==='exchange-coins')void exchangeShopCoins();
  if(act==='connect-coin-shop')reconnectCoinShop();
  if(act==='buy-stabilizer')buyStabilizer();
// unchanged production source at line 1418
