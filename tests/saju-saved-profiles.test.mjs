import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
  SajuSavedProfiles, SAVED_PROFILES_LIMIT, SAVED_PROFILES_PREFIX,
  normalizeSavedProfileInput,
} from '../games/starlit-saju/saved-profiles.mjs';
import {SajuProfilePicker} from '../games/starlit-saju/profile-picker.mjs';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
const MEMBER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW=Date.parse('2026-11-13T03:00:00.000Z');
const uuid=value=>'00000000-0000-4000-8000-'+String(value).padStart(12,'0');
const input=(name='민지',birth={})=>({
  name,gender:'female',
  birth:{year:1995,month:6,day:15,calendar:'solar',leapMonth:false,hour:0,minute:30,...birth},
});
const checkCode=code=>error=>error?.name==='SajuSavedProfileError'&&error.code===code;
function memoryStorage() {
  return {
    values:new Map(),reads:[],writes:[],
    getItem(key) {this.reads.push(key);return this.values.get(key)??null;},
    setItem(key,value) {this.writes.push([key,value]);this.values.set(key,value);},
  };
}
function fixture(options={}) {
  let identity={userId:MEMBER_A,anonymous:false},now=NOW,nextId=1;
  const storage=options.storage||memoryStorage();
  const store=new SajuSavedProfiles({
    getIdentity:()=>identity,storage,now:()=>new Date(now),
    createId:()=>uuid(nextId++),...options,
  });
  return {
    storage,store,
    identity:value=>{identity=value;},
    owner:owner=>{identity={userId:owner,anonymous:false};},
    advance:milliseconds=>{now+=milliseconds;},
    raw:()=>storage.values.get(SAVED_PROFILES_PREFIX+MEMBER_A),
    envelope:()=>JSON.parse(storage.values.get(SAVED_PROFILES_PREFIX+MEMBER_A)),
  };
}
function harness(t,store,options={}) {
  const dom=new JSDOM('<form><section id="profiles"></section></form>',{url:'https://ojjuda.kr/'});
  const element=dom.window.document.querySelector('#profiles');
  let current=input(),clears=0;
  const fills=[];
  const picker=new SajuProfilePicker({
    element,store,read:()=>current,
    fill:profile=>{fills.push(profile);current=structuredClone(profile);},
    clear:()=>{clears++;current=input('');},
    ...options,
  });
  t.after(()=>{picker.destroy();dom.window.close();});
  return {
    dom,element,picker,fills,
    current:value=>{current=value;},
    get clears(){return clears;},
    status:()=>element.querySelector('.profile-picker-status').textContent,
    button:selector=>element.querySelector(selector),
  };
}

test('stores exact original birth fields and restores them after a new store is constructed',()=>{
  const f=fixture(),value=input('  민지  ',{calendar:'lunar',year:2023,month:2,day:1,leapMonth:true,hour:null,minute:0});
  const saved=f.store.save(value);
  assert.equal(saved.name,'민지');
  assert.deepEqual(saved.birth,value.birth);
  const reloaded=new SajuSavedProfiles({
    getIdentity:()=>({userId:MEMBER_A,anonymous:false}),
    storage:f.storage,now:()=>new Date(NOW+3*86400000),
  });
  assert.deepEqual(reloaded.list(),[saved],'profiles survive the 24-hour reading access window');
  const key=[...f.storage.values.keys()][0];
  assert.equal(key,SAVED_PROFILES_PREFIX+MEMBER_A);
  assert.equal(key.includes('민지'),false);
  assert.equal(key.includes('2023'),false);
  assert.deepEqual(Object.keys(f.envelope()).sort(),['owner','profiles','version']);
});

test('unknown time stays distinct from midnight and optional name/sex stay empty',()=>{
  const f=fixture();
  const known=f.store.save(input('',{hour:0,minute:0}));
  const unknown=f.store.save({...input('',{hour:null,minute:0}),gender:null});
  assert.equal(f.store.list().length,2);
  assert.equal(known.birth.hour,0);
  assert.equal(unknown.birth.hour,null);
  const defaults=normalizeSavedProfileInput({birth:{year:1995,month:6,day:15}},{now:new Date(NOW)});
  assert.deepEqual(defaults,{name:'',gender:null,birth:{year:1995,month:6,day:15,calendar:'solar',leapMonth:false,hour:null,minute:0}});
});

test('identical saves deduplicate without changing timestamps or writing again',()=>{
  const f=fixture(),saved=f.store.save(input());
  f.advance(86400000);
  assert.deepEqual(f.store.save(input(' 민지 ')),saved);
  assert.equal(f.storage.writes.length,1);
  assert.equal(f.store.list().length,1);
});

test('editing a selected ID preserves its creation time and all other people',()=>{
  const f=fixture(),first=f.store.save(input()),other=f.store.save(input('준호'));
  f.advance(1000);
  const edited=f.store.save(input('김민지',{minute:45}),{id:first.id});
  assert.equal(edited.id,first.id);
  assert.equal(edited.createdAt,first.createdAt);
  assert.notEqual(edited.updatedAt,first.updatedAt);
  assert.deepEqual(f.store.list(),[edited,other]);
  f.advance(-500);
  assert.equal(f.store.save(input('민지 수정'),{id:first.id}).updatedAt,edited.updatedAt);
});

test('an edit cannot silently merge with or remove another saved person',()=>{
  const f=fixture(),first=f.store.save(input('가')),second=f.store.save(input('나'));
  const before=f.raw();
  assert.throws(()=>f.store.save(input('나'),{id:first.id}),checkCode('duplicate'));
  assert.equal(f.raw(),before);
  assert.equal(f.store.get(second.id).name,'나');
  assert.throws(()=>f.store.save(input('다'),{id:uuid(99)}),checkCode('not_found'));
  assert.equal(f.raw(),before);
});

test('the 20-person limit never evicts data; editing and deleting still work at the limit',()=>{
  const f=fixture(),saved=[];
  for(let i=0;i<SAVED_PROFILES_LIMIT;i++)saved.push(f.store.save(input('사람 '+i)));
  const before=f.raw();
  assert.throws(()=>f.store.save(input('21번째')),checkCode('limit'));
  assert.equal(f.raw(),before);
  assert.equal(f.store.save(input('수정'),{id:saved[0].id}).id,saved[0].id);
  assert.equal(f.store.remove(saved[1].id),true);
  assert.equal(f.store.remove(saved[1].id),false);
  f.store.save(input('새 사람'));
  assert.equal(f.store.list().length,20);
});

test('returned records are detached copies and do not mutate stored input',()=>{
  const f=fixture(),value=input(),saved=f.store.save(value);
  value.birth.year=2000;saved.name='changed';saved.birth.year=1900;
  const list=f.store.list();
  list[0].birth.month=12;list.push({id:'fake'});
  assert.equal(f.store.list().length,1);
  assert.equal(f.store.list()[0].name,'민지');
  assert.deepEqual(f.store.list()[0].birth,input().birth);
});

test('member namespaces stay isolated across logout and account changes',()=>{
  const f=fixture(),a=f.store.save(input('A의 정보'));
  f.owner(MEMBER_B);
  assert.deepEqual(f.store.list(),[]);
  assert.throws(()=>f.store.get(a.id),checkCode('not_found'));
  assert.throws(()=>f.store.save(input(),{id:a.id}),checkCode('not_found'));
  f.store.save(input('B의 정보'));
  assert.equal(f.store.list()[0].name,'B의 정보');
  f.owner(MEMBER_A.toUpperCase());
  assert.equal(f.store.list()[0].name,'A의 정보');
  assert.equal(f.storage.values.size,2);
});

test('unconfirmed and anonymous identities cannot read or write browser storage',()=>{
  const f=fixture();
  for(const identity of [
    null,{}, {userId:MEMBER_A}, {userId:MEMBER_A,anonymous:true},
    {userId:'member-a',anonymous:false}, {userId:42,anonymous:false},
    {userId:MEMBER_A,anonymous:0},
  ]) {
    f.identity(identity);
    for(const action of [()=>f.store.list(),()=>f.store.save(input()),()=>f.store.remove(uuid(1))]) {
      assert.throws(action,checkCode('not_signed_in'));
    }
  }
  assert.equal(f.storage.reads.length,0);
  assert.equal(f.storage.writes.length,0);
});

test('expected-owner guards stop delayed actions from saving into the next account',()=>{
  const f=fixture();
  f.owner(MEMBER_B);
  assert.throws(()=>f.store.save(input(),{expectedOwner:MEMBER_A}),checkCode('account_changed'));
  assert.throws(()=>f.store.remove(uuid(1),{expectedOwner:MEMBER_A}),checkCode('account_changed'));
  assert.equal(f.storage.writes.length,0);
  assert.equal(f.storage.reads.length,0);
});

test('identity changes during storage reads do not return or write another account’s data',()=>{
  const f=fixture();
  f.store.save(input('비공개'));
  const original=f.storage.getItem;
  f.storage.getItem=function(key) {
    const value=original.call(this,key);
    f.owner(MEMBER_B);
    return value;
  };
  assert.throws(()=>f.store.list(),checkCode('account_changed'));
  assert.equal(f.storage.writes.length,1);
  assert.equal(f.storage.values.has(SAVED_PROFILES_PREFIX+MEMBER_B),false);
});

test('identity changes during a write never place the old person in the new member namespace',()=>{
  const f=fixture();
  const original=f.storage.setItem;
  f.storage.setItem=function(key,value) {
    original.call(this,key,value);
    f.owner(MEMBER_B);
  };
  assert.throws(()=>f.store.save(input()),checkCode('account_changed'));
  assert.equal(f.storage.values.has(SAVED_PROFILES_PREFIX+MEMBER_B),false);
  assert.deepEqual(f.store.list(),[]);
});

for(const [label,patch] of [
  ['nonexistent solar day',{month:2,day:30}],
  ['non-leap-year February 29',{year:1900,month:2,day:29}],
  ['nonexistent lunar leap month',{year:2023,month:3,day:1,calendar:'lunar',leapMonth:true}],
  ['too many days in a lunar month',{year:2023,month:2,day:31,calendar:'lunar'}],
  ['solar leap-month flag',{leapMonth:true}],
  ['wrong date type',{year:'1995'}],
  ['out-of-range year',{year:1899}],
  ['negative hour',{hour:-1}],
  ['hour 24',{hour:24}],
  ['fractional hour',{hour:1.5}],
  ['minute 60',{minute:60}],
  ['unknown time with a minute',{hour:null,minute:20}],
  ['unrecognized calendar',{calendar:'unknown'}],
]) {
  test('rejects '+label+' before writing',()=>{
    const f=fixture();
    assert.throws(()=>f.store.save(input('검사',patch)),checkCode('invalid_birth'));
    assert.equal(f.storage.writes.length,0);
  });
}

test('future dates and future known times are rejected using the Korean civil date',()=>{
  const f=fixture();
  f.store.save(input('오늘 모름',{year:2026,month:11,day:13,hour:null,minute:0}));
  f.store.save(input('오늘 과거',{year:2026,month:11,day:13,hour:11,minute:59}));
  assert.throws(()=>f.store.save(input('미래',{year:2026,month:11,day:13,hour:12,minute:1})),checkCode('future_birth'));
  assert.throws(()=>f.store.save(input('내일',{year:2026,month:11,day:14,hour:null,minute:0})),checkCode('future_birth'));
  assert.equal(f.store.list().length,2);
});

test('name/sex validation is explicit and counts Unicode characters',()=>{
  const f=fixture();
  assert.equal(f.store.save({...input('가'.repeat(30)),gender:'male'}).name.length,30);
  assert.equal([...f.store.save(input('🙂'.repeat(30))).name].length,30);
  for(const name of ['가'.repeat(31),'이름\n다음 줄','방향\u202e변경',12]) {
    assert.throws(()=>f.store.save({...input(),name}),checkCode('invalid_name'));
  }
  for(const gender of ['',false,'man',1]) {
    assert.throws(()=>f.store.save({...input(),gender}),checkCode('invalid'));
  }
  const decomposed='민지';
  assert.equal(f.store.save(input(decomposed)).name,'민지');
});

for(const [label,change,code='corrupt'] of [
  ['invalid JSON',()=>'{bad'],
  ['oversized JSON',()=>'"'+'a'.repeat(65536)+'"'],
  ['wrong owner',value=>{value.owner=MEMBER_B;}],
  ['unsupported version',value=>{value.version=99;},'unsupported_version'],
  ['unexpected envelope fields',value=>{value.payment={paid:true};}],
  ['unexpected record fields',value=>{value.profiles[0].html='<script>'; }],
  ['invalid date',value=>{value.profiles[0].birth.day=99;}],
  ['missing birth fields',value=>{delete value.profiles[0].birth.hour;}],
  ['noncanonical null name',value=>{value.profiles[0].name=null;}],
  ['noncanonical null calendar',value=>{value.profiles[0].birth.calendar=null;}],
  ['invalid ID',value=>{value.profiles[0].id='<button>'; }],
  ['invalid timestamp',value=>{value.profiles[0].createdAt='yesterday';}],
  ['reversed timestamp',value=>{value.profiles[0].updatedAt='2000-01-01T00:00:00.000Z';}],
  ['duplicate ID',value=>{value.profiles.push({...value.profiles[0],name:'다른 이름'});}],
  ['duplicate information',value=>{value.profiles.push({...value.profiles[0],id:uuid(99)});}],
]) {
  test('malformed storage: '+label+' is not shown or overwritten',()=>{
    const f=fixture();
    f.store.save(input());
    const value=f.envelope(),replacement=change(value),raw=typeof replacement==='string'?replacement:JSON.stringify(value);
    f.storage.values.set(SAVED_PROFILES_PREFIX+MEMBER_A,raw);
    assert.throws(()=>f.store.list(),checkCode(code));
    assert.throws(()=>f.store.save(input('다른 사람')),checkCode(code));
    assert.throws(()=>f.store.remove(uuid(1)),checkCode(code));
    assert.equal(f.raw(),raw);
    assert.equal(f.storage.writes.length,1);
  });
}

test('blocked storage is reported without claiming a successful save',()=>{
  const options={getIdentity:()=>({userId:MEMBER_A,anonymous:false}),now:()=>new Date(NOW)};
  Object.defineProperty(options,'storage',{get(){throw new Error('blocked');}});
  const store=new SajuSavedProfiles(options);
  assert.throws(()=>store.list(),checkCode('storage_unavailable'));
  assert.throws(()=>store.save(input()),checkCode('storage_unavailable'));
});

test('full storage leaves all saved people intact and reports the storage failure',()=>{
  const f=fixture();
  f.store.save(input());
  const before=f.raw();
  f.storage.setItem=()=>{throw Object.assign(new Error('full'),{name:'QuotaExceededError'});};
  assert.throws(()=>f.store.save(input('추가')),checkCode('storage_full'));
  assert.throws(()=>f.store.remove(uuid(1)),checkCode('storage_full'));
  assert.equal(f.raw(),before);
  assert.equal(f.store.list()[0].name,'민지');
});

test('storage that silently discards a write cannot report success',()=>{
  const f=fixture();
  f.storage.setItem=()=>{};
  assert.throws(()=>f.store.save(input()),checkCode('storage_unavailable'));
  assert.deepEqual(f.store.list(),[]);
});

test('a failed or repeated UUID never overwrites an existing person',()=>{
  const f=fixture({createId:()=>uuid(1)});
  f.store.save(input());
  const before=f.raw();
  assert.throws(()=>f.store.save(input('두 번째')),checkCode('storage_unavailable'));
  assert.equal(f.raw(),before);
  const noCrypto=fixture({createId:()=>undefined});
  assert.throws(()=>noCrypto.store.save(input()),checkCode('storage_unavailable'));
  assert.equal(noCrypto.storage.writes.length,0);
});

test('picker lists name, gender and original lunar birthday as inert text',t=>{
  const f=fixture(),name='<img src=x onerror=alert(1)>';
  const saved=f.store.save(input(name,{calendar:'lunar',year:2023,month:2,day:1,leapMonth:true,hour:null,minute:0}));
  const h=harness(t,f.store);
  assert.equal(h.element.querySelector('.profile-picker-name').textContent,name);
  assert.equal(h.element.querySelector('img,script'),null);
  assert.match(h.element.querySelector('.profile-picker-meta').textContent,/여성.*음력 2023.*윤달.*시간 모름/);
  let submitted=0;
  h.element.closest('form').addEventListener('submit',event=>{event.preventDefault();submitted++;});
  const writes=f.storage.writes.length;
  h.button('.profile-picker-use').click();
  assert.deepEqual(h.fills,[saved]);
  assert.equal(h.picker.selectedId,saved.id);
  assert.equal(h.button('.profile-picker-use').getAttribute('aria-pressed'),'true');
  assert.equal(f.storage.writes.length,writes,'choosing a person only fills inputs');
  assert.equal(submitted,0);
  for(const button of h.element.querySelectorAll('button'))assert.equal(button.type,'button');
});

test('picker saves selected edits, supports a new person, and deletes only the chosen entry',async t=>{
  const f=fixture(),h=harness(t,f.store);
  const saved=await h.picker.saveCurrent();
  assert.ok(saved);
  h.current(input('새 이름'));
  const updated=await h.picker.saveCurrent();
  assert.equal(updated.id,saved.id);
  assert.equal(f.store.list().length,1);
  h.button('.profile-picker-new').click();
  assert.equal(h.clears,1);
  assert.equal(h.picker.selectedId,null);
  h.current({...input('다른 사람'),gender:'male'});
  const other=await h.picker.saveCurrent();
  assert.notEqual(other.id,saved.id);
  assert.equal(f.store.list().length,2);
  h.button('.profile-picker-delete').click();
  assert.equal(h.picker.selectedId,null);
  assert.deepEqual(f.store.list(),[updated]);
  assert.equal(h.clears,1,'deletion does not unexpectedly erase the form');
  assert.match(h.status(),/삭제/);
});

test('an unnamed profile uses its birthday as the button label',t=>{
  const f=fixture();
  f.store.save({...input(''),gender:null});
  const h=harness(t,f.store);
  assert.equal(h.element.querySelector('.profile-picker-name').textContent,'양력 1995. 06. 15.');
  assert.match(h.element.querySelector('.profile-picker-meta').textContent,/성별 미선택.*00:30/);
});

test('pickers sharing a store refresh each other after save and delete',async t=>{
  const f=fixture(),a=harness(t,f.store),b=harness(t,f.store);
  await a.picker.saveCurrent();
  assert.equal(b.element.querySelectorAll('.profile-picker-use').length,1);
  b.button('.profile-picker-use').click();
  assert.equal(b.fills.length,1);
  a.button('.profile-picker-delete').click();
  assert.equal(b.element.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(b.picker.selectedId,null);
});

test('a peer save refreshes the list without erasing a duplicate error, but account changes clear it',async t=>{
  const f=fixture();
  f.store.save(input('A'));f.store.save(input('B'));
  const a=harness(t,f.store),b=harness(t,f.store);
  [...a.element.querySelectorAll('.profile-picker-use')].find(button=>button.querySelector('.profile-picker-name').textContent==='A').click();
  a.current(input('B'));
  assert.equal(await a.picker.saveCurrent(),null);
  const message=a.status();
  assert.match(message,/같은 정보가 이미 저장/);
  assert.equal(a.element.querySelector('.profile-picker-status').getAttribute('role'),'alert');
  b.current(input('C'));
  assert.ok(await b.picker.saveCurrent());
  assert.equal(a.element.querySelectorAll('.profile-picker-use').length,3);
  assert.equal(a.status(),message);
  assert.equal(a.element.querySelector('.profile-picker-status').getAttribute('role'),'alert');
  f.owner(MEMBER_B);
  b.picker.refresh();b.current(input('다른 계정'));
  assert.ok(await b.picker.saveCurrent());
  assert.equal(a.element.querySelectorAll('.profile-picker-use').length,1);
  assert.equal(a.element.querySelector('.profile-picker-name').textContent,'다른 계정');
  assert.equal(a.status(),'');
  assert.equal(a.element.querySelector('.profile-picker-status').getAttribute('role'),'status');
});

test('picker returns null and shows an alert when validation or storage fails',async t=>{
  const f=fixture(),h=harness(t,f.store);
  h.current(input('잘못된 날짜',{month:2,day:30}));
  assert.equal(await h.picker.saveCurrent(),null);
  assert.equal(h.element.querySelector('[role=alert]').textContent,'생일과 태어난 시간을 다시 확인해 주세요.');
  h.current(input());
  f.storage.setItem=()=>{throw Object.assign(new Error('full'),{name:'QuotaExceededError'});};
  assert.equal(await h.picker.saveCurrent(),null);
  assert.match(h.element.querySelector('[role=alert]').textContent,/저장 공간이 부족/);
  assert.equal(h.element.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(h.status().includes('저장했어요'),false);
});

test('a read callback validation error stays visible and does not write data',async t=>{
  const f=fixture(),h=harness(t,f.store,{read:async()=>{throw new Error('생일을 다시 확인해 주세요.');}});
  assert.equal(await h.picker.saveCurrent(),null);
  assert.equal(h.status(),'생일을 다시 확인해 주세요.');
  assert.equal(f.storage.writes.length,0);
});

test('disabled controls do not fill/delete, while programmatic save remains available',async t=>{
  const f=fixture(),h=harness(t,f.store);
  f.store.save(input());
  h.picker.refresh();
  h.picker.setDisabled(true);
  for(const button of h.element.querySelectorAll('button'))assert.equal(button.disabled,true);
  h.button('.profile-picker-use').click();
  h.button('.profile-picker-delete').click();
  assert.equal(h.fills.length,0);
  assert.equal(f.store.list().length,1);
  assert.ok(await h.picker.saveCurrent());
  assert.equal(h.button('.profile-picker-save').disabled,true);
  h.picker.setDisabled(false);
  assert.equal(h.button('.profile-picker-save').disabled,false);
});

test('an account change during asynchronous validation cannot save into either account',async t=>{
  const f=fixture();
  let resolve;
  const read=new Promise(done=>{resolve=done;});
  const h=harness(t,f.store,{read:()=>read});
  const pending=h.picker.saveCurrent();
  f.owner(MEMBER_B);
  h.picker.refresh();
  resolve(input('A의 사람'));
  assert.equal(await pending,null);
  assert.equal(f.storage.writes.length,0);
  assert.equal(h.element.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(h.element.textContent.includes('A의 사람'),false);
});

test('resetting or destroying a picker cancels a pending save',async t=>{
  for(const action of ['resetSelection','destroy']) {
    const f=fixture();
    let resolve;
    const read=new Promise(done=>{resolve=done;});
    const h=harness(t,f.store,{read:()=>read});
    const pending=h.picker.saveCurrent();
    h.picker[action]();
    resolve(input());
    assert.equal(await pending,null);
    assert.equal(f.storage.writes.length,0);
  }
});

test('logout and a stale profile click clear the list without autofilling the previous member',t=>{
  const f=fixture();
  f.store.save(input('A 비공개'));
  const h=harness(t,f.store),stale=h.button('.profile-picker-use');
  f.identity(null);
  stale.click();
  assert.equal(h.fills.length,0);
  assert.equal(h.element.querySelectorAll('.profile-picker-use').length,0);
  assert.equal(h.element.textContent.includes('A 비공개'),false);
  assert.equal(h.button('.profile-picker-save').disabled,true);
});

test('repeated clicks while a save is pending create just one profile',async t=>{
  const f=fixture();
  let resolve;
  const read=new Promise(done=>{resolve=done;});
  const h=harness(t,f.store,{read:()=>read});
  const pending=h.picker.saveCurrent();
  assert.equal(await h.picker.saveCurrent(),null);
  resolve(input());
  assert.ok(await pending);
  assert.equal(f.storage.writes.length,1);
  assert.equal(f.store.list().length,1);
});
