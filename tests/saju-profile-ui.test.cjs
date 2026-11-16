const test = require('node:test');
const assert = require('node:assert/strict');
const {
  harness, fixedNow, PROFILE_USER_A, PROFILE_USER_B, pause, deferred, waitFor, selectReadingItem, assertNoReadingScores, assertNoCalculationUI, assertReadingScores, assertReadingScoreCopy
} = require('./helpers/saju-ui-harness.cjs');

// Saved people, birth-time conventions and zodiac display.
// Separate files give Node a process boundary for fresh jsdom/VM app
// contexts; all original scenarios and assertions remain intact.
test('completed birth input automatically saves, survives reload, and restores every field without a purchase',async t=>{
  const h=await harness();t.after(h.close);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A,host=h.$('saved-profiles');
  h.fill({name:'자동 저장',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37});
  h.advance(599);assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  h.advance(1);await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  const first=JSON.parse(h.window.localStorage.getItem(key)).profiles[0];
  assert.deepEqual(first.birth,{year:2023,month:2,day:10,calendar:'lunar',leapMonth:true,hour:8,minute:37});
  const name=h.$('person-name');
  name.dispatchEvent(new h.window.CompositionEvent('compositionstart',{bubbles:true}));
  name.value='한';name.dispatchEvent(new h.window.InputEvent('input',{bubbles:true,isComposing:true}));
  h.advance(600);assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'자동 저장','an unfinished IME composition is not stored');
  name.value='한별';name.dispatchEvent(new h.window.CompositionEvent('compositionend',{bubbles:true}));
  h.advance(600);await waitFor(()=>host.querySelector('.profile-picker-use').textContent.includes('한별'));
  const edited=JSON.parse(h.window.localStorage.getItem(key)).profiles;
  assert.equal(edited.length,1);assert.equal(edited[0].id,first.id);assert.equal(edited[0].name,'한별');
  const stored=h.window.localStorage.getItem(key);
  h.$('entry-year').value='2027';h.change(h.$('entry-year'));
  const product=h.window.document.querySelector('input[name="entry-topic"][value="annual"]');product.checked=true;h.change(product);
  h.advance(600);assert.equal(h.window.localStorage.getItem(key),stored,'product and forecast-year controls never edit a saved person');
  const reloaded=await harness({initialStorage:{[key]:stored}});t.after(reloaded.close);
  const saved=reloaded.$('saved-profiles').querySelector('.profile-picker-use');assert.ok(saved);saved.click();
  assert.equal(reloaded.$('person-name').value,'한별');assert.equal(reloaded.$('person-gender').value,'female');
  assert.equal(reloaded.window.document.querySelector('input[name="calendar"]:checked').value,'lunar');
  assert.equal(reloaded.$('leap-month').checked,true);assert.equal(reloaded.$('time-unknown').checked,false);
  assert.deepEqual(['birth-year','birth-month','birth-day','birth-hour','birth-minute'].map(id=>reloaded.$(id).value),['2023','2','10','8','37']);
  for(const page of [h,reloaded]){assert.equal(page.state.starts.length,0);assert.equal(page.state.charges,0);}
});

test('incomplete birth input waits quietly and valid pending edits flush synchronously before leaving the page',async t=>{
  const h=await harness();t.after(h.close);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A,host=h.$('saved-profiles'),name=h.$('person-name');
  name.value='작성 중';name.dispatchEvent(new h.window.Event('input',{bubbles:true}));h.advance(600);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.notEqual(host.querySelector('.profile-picker-status').dataset.state,'error');
  h.fill({name:'이동 전 저장',gender:'male',hour:null});
  h.window.dispatchEvent(new h.window.Event('pagehide'));
  assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'이동 전 저장','pagehide saves before returning from the event');
  name.value='포커스 이동';name.dispatchEvent(new h.window.Event('input',{bubbles:true}));
  name.dispatchEvent(new h.window.FocusEvent('focusout',{bubbles:true,relatedTarget:h.$('open-story')}));
  assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'포커스 이동');
  name.value='화면을 닫기 전';name.dispatchEvent(new h.window.Event('input',{bubbles:true}));
  Object.defineProperty(h.window.document,'visibilityState',{configurable:true,value:'hidden'});
  h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
  assert.equal(JSON.parse(h.window.localStorage.getItem(key)).profiles[0].name,'화면을 닫기 전');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('delayed identity and wallet failure still allow local saving while rapid account changes cancel old edits',async t=>{
  const identityGate=deferred(),h=await harness({identityGate,failInit:Infinity});t.after(h.close);
  const key=owner=>'ojjuda-saju-profiles-v1:'+owner,host=h.$('saved-profiles');
  h.fill({name:'첫 로그인 전에 입력',gender:'female',hour:8,minute:37});h.advance(600);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  identityGate.resolve();await waitFor(()=>h.state.instances[0].identityReady);
  assert.equal(h.$('person-name').value,'첫 로그인 전에 입력','the first confirmed owner does not erase the current input');
  h.advance(600);await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.equal(h.state.instances[0].ready,false,'a failed wallet initialization remains separate from local identity');
  const beforeInitCalls=h.state.initCalls;
  h.$('person-name').value='잔액 확인 없이 수정';h.change(h.$('person-name'));
  host.querySelector('.profile-picker-save').click();
  await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success');
  assert.equal(h.state.initCalls,beforeInitCalls,'manual saving does not retry wallet or auth initialization');
  assert.ok(!h.state.moduleRequests.some(url=>/\/(readings|fortune-data|daeun)\.mjs/.test(url)),'the local zodiac preview does not load paid readings or start a purchase');
  const storedA=h.window.localStorage.getItem(key(PROFILE_USER_A));
  h.$('person-name').value='취소되어야 할 수정';h.change(h.$('person-name'));
  h.changeAccount(PROFILE_USER_B);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0,'a real account change clears even before any wallet initialization succeeds');
  h.changeAccount(PROFILE_USER_A);h.changeAccount(PROFILE_USER_B);h.advance(600);await pause();
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_A)),storedA);
  assert.equal(h.window.localStorage.getItem(key(PROFILE_USER_B)),null,'an old pending edit cannot enter a different account');
  h.fill({name:'두 번째 회원',gender:'male',year:1994,month:11,day:8,hour:null});h.advance(600);
  assert.equal(JSON.parse(h.window.localStorage.getItem(key(PROFILE_USER_B))).profiles[0].name,'두 번째 회원');
  h.$('person-name').value='로그아웃 전 미완료';h.change(h.$('person-name'));h.changeAccount(null,false);h.advance(600);await pause();
  assert.equal(h.$('person-name').value,'');assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(JSON.parse(h.window.localStorage.getItem(key(PROFILE_USER_B))).profiles[0].name,'두 번째 회원');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('saved people restore every birth field, render names as text, and allow edits and deletion without payment',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const host=h.$('saved-profiles'),uses=()=>[...host.querySelectorAll('.profile-picker-use')];
  const save=async()=>{
    host.querySelector('.profile-picker-save').click();
    await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success'&&!host.querySelector('.profile-picker-save').disabled,'profile save did not settle');
  };
  h.fill({name:'한별',gender:'female',year:2023,month:2,day:10,calendar:'lunar',leap:true,hour:8,minute:37});
  await save();assert.equal(uses().length,1);
  assert.match(uses()[0].textContent,/한별.*여성.*음력.*윤달.*08:37/);
  host.querySelector('.profile-picker-new').click();
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'');
  assert.equal(host.querySelectorAll('.is-selected').length,0);
  const markup='<img src=x onerror=alert(1)>';
  h.fill({name:markup,gender:'male',year:1994,month:11,day:8,hour:null});
  await save();assert.equal(uses().length,2);
  assert.ok(uses().some(button=>button.textContent.includes(markup)));
  assert.equal(host.querySelector('img,script,[onerror]'),null,'a stored name never becomes markup');
  uses().find(button=>button.textContent.includes('한별')).click();
  assert.equal(h.$('person-name').value,'한별');assert.equal(h.$('person-gender').value,'female');
  assert.equal(h.window.document.querySelector('input[name="calendar"]:checked').value,'lunar');
  assert.deepEqual(['birth-year','birth-month','birth-day','birth-hour','birth-minute'].map(id=>h.$(id).value),['2023','2','10','8','37']);
  assert.equal(h.$('leap-month').checked,true);assert.equal(h.$('time-unknown').checked,false);
  assert.equal(host.querySelectorAll('.is-selected').length,1);
  h.$('person-name').value='한별 수정';h.change(h.$('person-name'));await save();
  assert.equal(uses().length,2,'saving an edited selected person updates that record');
  assert.ok(uses().some(button=>button.textContent.includes('한별 수정')));
  uses().find(button=>button.textContent.includes(markup)).click();
  assert.equal(h.$('time-unknown').checked,true);assert.equal(h.$('birth-hour').value,'');assert.equal(h.$('birth-minute').value,'');
  assert.equal(h.$('leap-month').checked,false);assert.equal(h.window.document.querySelector('input[name="calendar"]:checked').value,'solar');
  host.querySelector('.is-selected .profile-picker-delete').click();
  assert.equal(uses().length,1);assert.equal(host.textContent.includes(markup),false);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
});

test('another saved birthday costs ten ju only on opening and returning to the first keeps its original free access deadline',async t=>{
  const h=await harness();t.after(h.close);
  const host=h.$('saved-profiles'),uses=()=>[...host.querySelectorAll('.profile-picker-use')];
  const pick=name=>uses().find(button=>button.textContent.includes(name)).click();
  const save=async()=>{
    host.querySelector('.profile-picker-save').click();
    await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='success'&&!host.querySelector('.profile-picker-save').disabled);
  };
  const quote=async(iso,amount)=>waitFor(()=>h.state.statusCalls.at(-1)?.solar.iso===iso
    &&h.$('open-story').dataset.expectedCharge===String(amount)&&!h.$('open-story').disabled);
  h.fill({name:'먼저 볼 사람',gender:'female',year:1990,month:5,day:17,hour:8,minute:37,topic:'annual',fortuneYear:2026});
  h.advance(600);await waitFor(()=>uses().length===1);
  host.querySelector('.profile-picker-new').click();
  h.fill({name:'다른 생일의 사람',gender:'male',year:1994,month:11,day:8,hour:8,minute:37,topic:'annual',fortuneYear:2026});
  await save();assert.equal(uses().length,2);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0,'entering and saving two birthdays never purchases a reading');

  pick('먼저 볼 사람');await quote('1990-05-17',10);
  assert.equal(h.state.starts.length,0,'selecting a saved person only checks the quote');
  h.submit();await h.ready('annual',2026);
  assert.deepEqual(h.state.chargedAmounts,[10]);
  const [firstKey,first]=[...h.state.receipts.entries()][0],original={...first},originalNote=h.$('current-reading-note').textContent;
  h.advance(60*60*1000);
  h.$('edit-birth').click();pick('다른 생일의 사람');await quote('1994-11-08',10);
  await save();
  assert.equal(h.state.starts.length,1);assert.equal(h.state.charges,1,'switching or saving the second birthday does not debit');
  assert.equal(h.$('result').hidden,true);
  h.submit();await h.ready('annual',2026);
  assert.equal(h.state.starts[1].expectedCharge,10);assert.equal(h.state.starts[1].chart.solar.iso,'1994-11-08');
  assert.deepEqual(h.state.chargedAmounts,[10,10],'the second birthday costs ten total, with no separate surcharge');
  assert.equal(h.state.receipts.size,2);assert.deepEqual(h.state.receipts.get(firstKey),original);

  h.advance(2*60*60*1000);
  h.$('edit-birth').click();pick('먼저 볼 사람');await quote('1990-05-17',0);
  await save();
  assert.equal(h.state.starts.length,2);assert.equal(h.state.charges,2);
  assert.deepEqual(h.state.receipts.get(firstKey),original,'selecting and saving an existing birthday does not renew its paid access');
  h.submit();await h.ready('annual',2026);
  assert.equal(h.state.starts[2].expectedCharge,0);assert.equal(h.state.starts[2].chart.solar.iso,'1990-05-17');
  assert.equal(h.state.starts[2].year,2026);assert.deepEqual(h.state.chargedAmounts,[10,10]);
  assert.equal(h.state.coins,10);assert.equal(h.state.receipts.size,2);
  assert.deepEqual(h.state.receipts.get(firstKey),original,'the original request, payment time and expiry remain unchanged');
  assert.equal(h.$('current-reading-note').textContent,originalNote,'the displayed deadline also remains the original one');
});

test('saved people persist on reopening and remain isolated after account changes and sign-out',async t=>{
  const original=await harness({user:PROFILE_USER_A});t.after(original.close);
  original.fill({name:'내가 저장한 사람',gender:'male',hour:4,minute:12});
  original.$('saved-profiles').querySelector('.profile-picker-save').click();
  await waitFor(()=>original.$('saved-profiles').querySelectorAll('.profile-picker-use').length===1);
  const storage=original.window.localStorage;
  const initialStorage=Object.fromEntries(Array.from({length:storage.length},(_,index)=>{const key=storage.key(index);return [key,storage.getItem(key)];}));
  const h=await harness({user:PROFILE_USER_A,initialStorage});t.after(h.close);
  const host=h.$('saved-profiles');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  host.querySelector('.profile-picker-use').click();
  assert.equal(h.$('person-name').value,'내가 저장한 사람');assert.equal(h.$('birth-hour').value,'4');
  h.changeAccount(PROFILE_USER_B);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);assert.equal(host.textContent.includes('내가 저장한 사람'),false);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('person-gender').value,'');assert.equal(h.$('birth-year').value,'');
  h.changeAccount(PROFILE_USER_A);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.changeAccount(null,false);await pause();
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);assert.equal(host.querySelector('.profile-picker-save').disabled,true);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(original.state.starts.length,0);
});

test('a device storage failure is visible and preserves the entered information without claiming a save or charging',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'지워지면 안 되는 입력',gender:'female',hour:8,minute:37});
  const host=h.$('saved-profiles');
  h.window.Storage.prototype.setItem=function(){throw new h.window.DOMException('storage full','QuotaExceededError');};
  host.querySelector('.profile-picker-save').click();
  await waitFor(()=>host.querySelector('.profile-picker-status').dataset.state==='error');
  const status=host.querySelector('.profile-picker-status');
  assert.match(status.textContent,/저장 공간.*부족/);assert.equal(status.getAttribute('role'),'alert');
  assert.doesNotMatch(status.textContent,/저장했어요/);assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(h.$('person-name').value,'지워지면 안 되는 입력');assert.equal(h.$('person-gender').value,'female');
  assert.equal(h.$('birth-hour').value,'8');assert.equal(h.$('birth-minute').value,'37');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);assert.equal(h.$('result').hidden,true);
});

test('name and gender edits reuse the original entitlement while the actual ten-year reading follows the selected gender',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'민준',gender:'male',hour:8,minute:37});h.submit();await h.ready();
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  const firstDaeun=h.$('reading-daeun').textContent,receipt=[...h.state.receipts.values()][0],expiry=receipt.expires_at;
  const firstBirth=JSON.stringify(h.state.starts[0].chart.input);
  assert.equal(h.$('saved-profiles').querySelectorAll('.profile-picker-use').length,1,'opening a reading also saves its entered person');
  h.$('edit-birth').click();
  h.$('person-name').value='민준 이름 수정';h.change(h.$('person-name'));
  h.$('person-gender').value='female';h.change(h.$('person-gender'));
  await waitFor(()=>h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  assert.equal(h.state.starts.length,1,'changing display details never purchases automatically');
  h.submit();await h.ready();
  assert.notEqual(h.$('reading-daeun').textContent,firstDaeun);
  assert.equal(h.state.starts.at(-1).expectedCharge,0);assert.equal(h.state.charges,1);
  assert.equal(JSON.stringify(h.state.starts.at(-1).chart.input),firstBirth);
  assert.equal([...h.state.receipts.values()][0].expires_at,expiry);
  h.$('edit-birth').click();h.$('person-name').value='<svg/onload=alert(1)>';h.change(h.$('person-name'));
  await waitFor(()=>h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  h.submit();await h.ready();assert.equal(h.state.charges,1);
  assert.equal(h.$('birth-summary').querySelector('[onload],script'),null);
  assert.equal(h.$('saved-profiles').querySelector('[onload],script'),null);
  h.pickReport('all',2026);h.$('open-product').click();await h.ready('all',2026);
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  assert.deepEqual(h.state.chargedAmounts,[10,20],'the ten-year reading adds no fee to lifelong or full access');
});

test('unknown birth time assumes 06:00 only for daeun while preserving stored input and the original paid access',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'시간 미상 예시',gender:'female',hour:null});h.submit();await h.ready();
  const notice='태어난 시간을 몰라 대운은 오전 6시 00분을 기준으로 계산했어요.';
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  assert.equal(h.$('reading-daeun').querySelector('.daeun-time-notice').textContent,notice);
  const chart=h.state.starts[0].chart,originalChart=JSON.stringify(chart);
  assert.equal(chart.timeKnown,false);assert.equal(chart.input.hour,null);assert.equal(chart.input.minute,0);
  const hourPillar=chart.pillars.find(pillar=>pillar.key==='hour');
  assert.equal(hourPillar.uncertain,true);assert.equal(hourPillar.hanja,null,'the general natal chart must not acquire a made-up hour pillar');
  assert.equal(hourPillar.reason,'birth-time-unknown');
  assert.match(h.$('birth-summary').textContent,/시간 모름/);
  const storageKey='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const stored=()=>JSON.parse(h.window.localStorage.getItem(storageKey)).profiles[0].birth;
  assert.equal(stored().hour,null);assert.equal(stored().minute,0);
  assert.equal(h.$('time-unknown').checked,true);
  const [receiptKey,receipt]=[...h.state.receipts.entries()][0],originalReceipt={...receipt};
  assert.match(receiptKey,/\|unknown\|lifelong\|0$/,'the payment identity remains the original unknown-time birth');
  assert.deepEqual(h.state.chargedAmounts,[10],'the assumed daeun adds no surcharge');
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.ok(h.state.copies[0].includes(notice),'the copy clearly discloses the daeun-only assumption');
  assertNoCalculationUI(h);

  h.advance(2*3600000);h.$('edit-birth').click();
  h.$('time-unknown').checked=false;h.change(h.$('time-unknown'));
  h.$('birth-hour').value='6';h.change(h.$('birth-hour'));
  h.$('birth-minute').value='0';h.change(h.$('birth-minute'));
  await waitFor(()=>h.state.statusCalls.at(-1)?.timeKnown===true&&h.$('open-story').dataset.expectedCharge==='10'&&!h.$('open-story').disabled);
  assert.equal(h.state.statusCalls.at(-1).input.hour,6,'an explicitly entered 06:00 remains a different birth identity');
  assert.equal(h.state.starts.length,1,'editing the time only refreshes the quote');
  h.$('time-unknown').checked=true;h.change(h.$('time-unknown'));
  await waitFor(()=>h.state.statusCalls.at(-1)?.timeKnown===false&&h.$('open-story').dataset.expectedCharge==='0'&&!h.$('open-story').disabled);
  h.submit();await h.ready();
  assert.equal(h.state.starts.at(-1).expectedCharge,0);assert.deepEqual(h.state.chargedAmounts,[10]);
  assert.equal(JSON.stringify(h.state.starts.at(-1).chart),originalChart,'daeun preparation leaves every original chart field unchanged');
  assert.deepEqual(h.state.receipts.get(receiptKey),originalReceipt,'reopening keeps the request, payment time and 24-hour deadline');
  assert.equal(stored().hour,null);assert.equal(stored().minute,0);
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,9);
  h.advance(Date.parse(originalReceipt.expires_at)-h.window.Date.now());
  assert.equal(h.$('report-content').textContent,'');assert.equal(h.$('copy-reading').disabled,true);
  assert.deepEqual(h.state.chargedAmounts,[10],'the assumed-time reading never renews itself');
});

test('a known but uncertain solar-term minute still does not fabricate ten-year periods',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  h.fill({name:'절기 경계',gender:'male',year:2024,month:2,day:4,hour:17,minute:27});h.submit();await h.ready();
  assert.equal(h.$('reading-daeun').querySelectorAll('.daeun-period[data-daeun-period]').length,0);
  const score=h.$('reading-daeun').querySelector('.saju-reading-score');
  assert.equal(score.dataset.readingScoreStatus,'unavailable');
  assert.equal(score.querySelector('[role="meter"]'),null,'a known boundary minute is not replaced by 06:00');
  assert.match(h.$('reading-daeun').textContent,/절기/);
  assert.equal(h.state.chargedAmounts[0],10);
});

test('unchecking the main unknown-time box leaves hour and minute unselected until both are explicitly entered',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);h.fill({gender:'male',hour:null});
  for(const id of ['birth-hour','birth-minute']) {assert.equal(h.$(id).value,'');assert.equal(h.$(id).required,true);assert.equal(h.$(id).disabled,true);}
  h.$('time-unknown').checked=false;h.change(h.$('time-unknown'));
  assert.equal(h.$('birth-hour').value,'');assert.equal(h.$('birth-minute').value,'');
  assert.equal(h.$('birth-form').checkValidity(),false);h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('birth-hour').value='0';h.change(h.$('birth-hour'));
  assert.equal(h.$('birth-form').checkValidity(),false);h.submit();await pause();assert.equal(h.state.starts.length,0);
  h.$('birth-minute').value='0';h.change(h.$('birth-minute'));
  await waitFor(()=>!h.$('open-story').disabled);h.submit();await h.ready();
  assert.equal(h.state.starts[0].chart.input.hour,0);assert.equal(h.state.starts[0].chart.input.minute,0);
  assert.equal(h.state.starts[0].chart.timeKnown,true);assert.deepEqual(h.state.chargedAmounts,[10]);
});

test('returning to the saju tab refreshes people saved or deleted in another tab without purchasing',async t=>{
  const h=await harness({user:PROFILE_USER_A});t.after(h.close);
  const other=await harness({user:PROFILE_USER_A});t.after(other.close);
  const host=h.$('saved-profiles'),otherHost=other.$('saved-profiles');
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0);
  other.fill({name:'다른 탭에서 저장',gender:'female',year:1993,month:7,day:12,hour:9,minute:25});
  otherHost.querySelector('.profile-picker-save').click();
  await waitFor(()=>otherHost.querySelectorAll('.profile-picker-use').length===1);
  const key='ojjuda-saju-profiles-v1:'+PROFILE_USER_A;
  const saved=other.window.localStorage.getItem(key);assert.ok(saved);
  h.window.localStorage.setItem(key,saved);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,0,'storage synchronization alone does not manipulate the existing DOM');
  h.window.dispatchEvent(new h.window.Event('focus'));
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.match(host.querySelector('.profile-picker-use').textContent,/다른 탭에서 저장.*여성.*09:25/);
  assert.equal(h.$('person-name').value,'');assert.equal(h.$('birth-year').value,'','refreshing the list does not fill or purchase a person automatically');
  otherHost.querySelector('.profile-picker-delete').click();
  const deleted=other.window.localStorage.getItem(key);
  if(deleted===null)h.window.localStorage.removeItem(key);else h.window.localStorage.setItem(key,deleted);
  assert.equal(host.querySelectorAll('.profile-picker-use').length,1);
  h.window.dispatchEvent(new h.window.StorageEvent('storage',{key,oldValue:saved,newValue:deleted,storageArea:h.window.localStorage,url:other.window.location.href}));
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===0);
  assert.equal(host.textContent.includes('다른 탭에서 저장'),false);
  for(const tab of [h,other]) {assert.equal(tab.state.starts.length,0);assert.equal(tab.state.charges,0);assert.equal(tab.$('result').hidden,true);}
});


test('zodiac preview follows the actual birth date before login and clears incomplete or invalid inputs',async t=>{
  const h=await harness({user:null,signedIn:false});t.after(h.close);
  assert.equal(h.$('birth-zodiac').hidden,true);
  h.fill({year:1990,month:1,day:1});
  await waitFor(()=>!h.$('birth-zodiac').hidden);
  assert.match(h.$('birth-zodiac').textContent,/뱀띠.*사주에서는 입춘부터 띠가 바뀌어요/);
  h.fill({year:2024,month:2,day:4,hour:null});
  await waitFor(()=>h.$('birth-zodiac').textContent.includes('토끼띠 / 용띠'));
  assert.match(h.$('birth-zodiac').textContent,/태어난 시간을 알아야/);
  h.fill({year:2024,month:2,day:4,hour:20,minute:0});
  await waitFor(()=>h.$('birth-zodiac').querySelector('strong')?.textContent==='용띠');
  h.fill({year:2024,month:2,day:30});
  assert.equal(h.$('birth-zodiac').hidden,true);await pause();
  assert.equal(h.$('birth-zodiac').textContent,'');
  h.fill({year:2024,month:1,day:1,calendar:'lunar'});
  await waitFor(()=>h.$('birth-zodiac').querySelector('strong')?.textContent==='용띠');
  h.$('birth-month').value='';h.change(h.$('birth-month'));
  assert.equal(h.$('birth-zodiac').hidden,true);assert.equal(h.$('birth-zodiac').textContent,'');
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});

test('zodiac labels appear in saved people, restore on selection, and accompany the result and copy',async t=>{
  const h=await harness();t.after(h.close);
  h.fill({year:1990,month:1,day:1,name:'연초 생일'});h.advance(600);
  const host=h.$('saved-profiles');
  await waitFor(()=>host.querySelector('.profile-picker-zodiac')?.textContent.includes('뱀띠'));
  host.querySelector('.profile-picker-new').click();
  assert.equal(h.$('birth-zodiac').hidden,true);
  host.querySelector('.profile-picker-use').click();
  await waitFor(()=>h.$('birth-zodiac').querySelector('strong')?.textContent==='뱀띠');
  assert.equal(h.$('birth-year').value,'1990');assert.equal(h.$('birth-month').value,'1');
  assert.equal(h.state.starts.length,0);
  h.submit();await h.ready();
  assert.match(h.$('result-zodiac').textContent,/뱀띠.*입춘/);
  h.$('copy-reading').click();await waitFor(()=>h.state.copies.length===1);
  assert.match(h.state.copies[0],/뱀띠 · 사주에서는 입춘부터 띠가 바뀌어요/);
  assert.equal(h.state.charges,1);
  h.changeAccount(PROFILE_USER_B);
  assert.equal(h.$('result-zodiac').hidden,true);assert.equal(h.$('result-zodiac').textContent,'');
  assert.equal(h.$('birth-zodiac').hidden,true);assert.equal(h.$('birth-zodiac').textContent,'');
  await waitFor(()=>h.state.instances[0].ready);await pause();
});

test('a delayed zodiac module never blocks saving or restores a cleared or previous-account preview',async t=>{
  const zodiacGate=deferred(),h=await harness({zodiacGate,failInit:Infinity});t.after(h.close);
  h.fill({year:1990,month:1,day:1,name:'먼저 저장'});h.advance(600);
  const host=h.$('saved-profiles');
  await waitFor(()=>host.querySelectorAll('.profile-picker-use').length===1);
  assert.equal(h.$('birth-zodiac').hidden,true);
  assert.equal(JSON.parse(h.window.localStorage.getItem('ojjuda-saju-profiles-v1:'+PROFILE_USER_A)).profiles[0].name,'먼저 저장');
  host.querySelector('.profile-picker-new').click();h.changeAccount(PROFILE_USER_B);
  zodiacGate.resolve();await waitFor(()=>h.state.moduleRequests.some(url=>/zodiac\.mjs/.test(url)));await pause();
  assert.equal(h.$('birth-zodiac').hidden,true);assert.equal(h.$('birth-zodiac').textContent,'');
  assert.equal(host.querySelectorAll('.profile-picker-zodiac').length,0);
  assert.equal(h.state.starts.length,0);assert.equal(h.state.charges,0);
});
