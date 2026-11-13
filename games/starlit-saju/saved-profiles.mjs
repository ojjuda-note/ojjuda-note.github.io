import KoreanLunarCalendar from './vendor/korean-lunar-0.4.0.mjs?v=20261112-starlit-saju1';

// Device-local input conveniences only. No reading, receipt, balance or access
// expiry is stored here, and no method performs a network or payment request.
export const SAVED_PROFILES_LIMIT = 20;
export const SAVED_PROFILE_NAME_LIMIT = 30;
export const SAVED_PROFILES_PREFIX = 'ojjuda-saju-profiles-v1:';
const VERSION = 1;
const MAX_JSON_LENGTH = 65536;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID=value=>typeof value==='string'&&UUID.test(value);
const BIRTH_KEYS = ['year','month','day','calendar','leapMonth','hour','minute'];
const PROFILE_KEYS = ['id','name','gender','birth','createdAt','updatedAt'];
const MESSAGES = Object.freeze({
  not_signed_in:'로그인하면 이 기기에 출생 정보를 저장할 수 있어요.',
  account_changed:'로그인한 계정이 바뀌었어요. 저장할 정보를 다시 확인해 주세요.',
  invalid:'이름·성별·생일을 다시 확인해 주세요.',
  invalid_name:'이름은 30자 안으로 입력해 주세요.',
  invalid_birth:'생일과 태어난 시간을 다시 확인해 주세요.',
  future_birth:'미래의 날짜와 시간은 생일로 저장할 수 없어요.',
  clock:'기기의 현재 날짜와 시간을 확인해 주세요.',
  not_found:'이 저장 정보가 바뀌었거나 삭제됐어요. 목록에서 다시 골라 주세요.',
  duplicate:'같은 정보가 이미 저장되어 있어요. 저장된 목록에서 골라 주세요.',
  limit:'최대 20명까지 저장할 수 있어요. 필요 없는 정보를 지운 뒤 다시 저장해 주세요.',
  storage_unavailable:'이 기기에 정보를 저장하거나 불러오지 못했어요. 브라우저의 저장 설정을 확인해 주세요.',
  storage_full:'이 기기의 저장 공간이 부족해요. 필요 없는 저장 정보를 지운 뒤 다시 시도해 주세요.',
  corrupt:'저장된 출생 정보를 확인하지 못했어요. 이 기기의 저장 내용을 확인해 주세요.',
  unsupported_version:'저장 정보의 형식이 달라요. 최신 화면으로 새로고침해 주세요.',
  busy:'정보를 저장하고 있어요. 잠시만 기다려 주세요.',
  changed:'입력하거나 선택한 정보가 바뀌었어요. 현재 내용을 다시 저장해 주세요.',
});

export class SajuSavedProfileError extends Error {
  constructor(code='invalid') {
    super(MESSAGES[code] || MESSAGES.invalid);
    this.name='SajuSavedProfileError';
    this.code=Object.hasOwn(MESSAGES,code)?code:'invalid';
  }
}
const fail=code=>{throw new SajuSavedProfileError(code);};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const exactKeys=(value,keys)=>record(value)&&Object.keys(value).length===keys.length
  && keys.every(key=>Object.hasOwn(value,key));
const copy=value=>JSON.parse(JSON.stringify(value));
const signature=value=>JSON.stringify([value.name,value.gender,...BIRTH_KEYS.map(key=>value.birth[key])]);
function clock(value) {
  const date=value instanceof Date?new Date(value.getTime()):typeof value==='number'?new Date(value):null;
  if(!date||!Number.isFinite(date.getTime()))fail('clock');
  return date;
}
function validStamp(value) {
  if(typeof value!=='string')return false;
  const date=new Date(value);
  return Number.isFinite(date.getTime())&&date.toISOString()===value;
}
function storageError(error) {
  return new SajuSavedProfileError(error?.name==='QuotaExceededError'?'storage_full':'storage_unavailable');
}

export function normalizeSavedProfileInput(value,{now=new Date()}={}) {
  if(!record(value)||!record(value.birth))fail('invalid');
  const name=value.name??'';
  if(typeof name!=='string')fail('invalid_name');
  const normalizedName=name.trim().normalize('NFC');
  if([...normalizedName].length>SAVED_PROFILE_NAME_LIMIT
    || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(normalizedName))fail('invalid_name');
  const gender=value.gender??null;
  if(![null,'male','female'].includes(gender))fail('invalid');
  const raw=value.birth;
  const birth={
    year:raw.year,month:raw.month,day:raw.day,
    calendar:raw.calendar??'solar',leapMonth:raw.leapMonth??false,
    hour:raw.hour??null,minute:raw.minute??0,
  };
  if(!Number.isInteger(birth.year)||birth.year<1900||birth.year>2050
    || !Number.isInteger(birth.month)||birth.month<1||birth.month>12
    || !Number.isInteger(birth.day)||birth.day<1||birth.day>31
    || !['solar','lunar'].includes(birth.calendar)||typeof birth.leapMonth!=='boolean'
    || (birth.calendar==='solar'&&birth.leapMonth)
    || !Number.isInteger(birth.minute)||birth.minute<0||birth.minute>59
    || (birth.hour===null?birth.minute!==0:!Number.isInteger(birth.hour)||birth.hour<0||birth.hour>23))fail('invalid_birth');
  const converter=new KoreanLunarCalendar();
  let valid=false;
  try {
    valid=birth.calendar==='lunar'
      ? converter.setLunarDate(birth.year,birth.month,birth.day,birth.leapMonth)
      : converter.setSolarDate(birth.year,birth.month,birth.day);
  } catch {fail('invalid_birth');}
  if(!valid)fail('invalid_birth');
  const solar=converter.getSolarCalendar(),today=clock(now);
  if(solar.year<1900||solar.year>2050)fail('invalid_birth');
  const koreaToday=new Date(today.getTime()+9*3600000);
  const day=Date.UTC(solar.year,solar.month-1,solar.day);
  const currentDay=Date.UTC(koreaToday.getUTCFullYear(),koreaToday.getUTCMonth(),koreaToday.getUTCDate());
  if(day>currentDay||(birth.hour!==null&&day+(birth.hour*60+birth.minute)*60000-9*3600000>today.getTime()))fail('future_birth');
  return {name:normalizedName,gender,birth};
}

export class SajuSavedProfiles {
  constructor(options={}) {
    if(typeof options.getIdentity!=='function')fail('invalid');
    this.getIdentity=options.getIdentity;
    this.storageOption=Object.hasOwn(options,'storage')?()=>options.storage:()=>globalThis.localStorage;
    this.now=options.now||(()=>new Date());
    this.createId=options.createId||(()=>globalThis.crypto?.randomUUID?.());
    if(typeof this.now!=='function'||typeof this.createId!=='function')fail('invalid');
  }

  ownerId() {
    let identity;
    try {identity=this.getIdentity();} catch {fail('not_signed_in');}
    if(!record(identity)||identity.anonymous!==false||!isUUID(identity.userId))fail('not_signed_in');
    return identity.userId.toLowerCase();
  }

  assertOwner(owner) {
    let current;
    try {current=this.ownerId();} catch {fail('account_changed');}
    if(current!==owner)fail('account_changed');
  }

  storage() {
    try {
      const storage=this.storageOption();
      if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error();
      return storage;
    } catch(error) {throw storageError(error);}
  }

  read(owner,storage) {
    this.assertOwner(owner);
    let raw;
    try {raw=storage.getItem(SAVED_PROFILES_PREFIX+owner);} catch(error) {throw storageError(error);}
    this.assertOwner(owner);
    if(raw===null)return [];
    if(typeof raw!=='string'||raw.length>MAX_JSON_LENGTH)fail('corrupt');
    let envelope;
    try {envelope=JSON.parse(raw);} catch {fail('corrupt');}
    if(!exactKeys(envelope,['version','owner','profiles']))fail('corrupt');
    if(envelope.version!==VERSION)fail('unsupported_version');
    if(envelope.owner!==owner||!Array.isArray(envelope.profiles)||envelope.profiles.length>SAVED_PROFILES_LIMIT)fail('corrupt');
    const ids=new Set(),identities=new Set(),profiles=[];
    const now=clock(this.now());
    for(const item of envelope.profiles) {
      if(!exactKeys(item,PROFILE_KEYS)||!isUUID(item.id)||item.id!==item.id.toLowerCase()||ids.has(item.id)
        || !exactKeys(item.birth,BIRTH_KEYS)||!validStamp(item.createdAt)||!validStamp(item.updatedAt)
        || item.updatedAt<item.createdAt)fail('corrupt');
      let data;
      try {data=normalizeSavedProfileInput(item,{now});} catch {fail('corrupt');}
      if(item.name!==data.name||item.gender!==data.gender
        || BIRTH_KEYS.some(key=>item.birth[key]!==data.birth[key]))fail('corrupt');
      const key=signature(data);
      if(identities.has(key))fail('corrupt');
      ids.add(item.id);identities.add(key);
      profiles.push({id:item.id,...data,createdAt:item.createdAt,updatedAt:item.updatedAt});
    }
    this.assertOwner(owner);
    return profiles;
  }

  write(owner,storage,profiles) {
    this.assertOwner(owner);
    const value=JSON.stringify({version:VERSION,owner,profiles});
    try {storage.setItem(SAVED_PROFILES_PREFIX+owner,value);} catch(error) {throw storageError(error);}
    this.assertOwner(owner);
    let stored;
    try {stored=storage.getItem(SAVED_PROFILES_PREFIX+owner);} catch(error) {throw storageError(error);}
    this.assertOwner(owner);
    if(stored!==value)fail('storage_unavailable');
  }

  list() {
    const owner=this.ownerId();
    return copy(this.read(owner,this.storage()));
  }

  get(id) {
    if(!isUUID(id))fail('not_found');
    const profile=this.list().find(value=>value.id===id);
    if(!profile)fail('not_found');
    return profile;
  }

  save(value,{id=null,expectedOwner=null}={}) {
    const owner=this.ownerId();
    if(expectedOwner!==null&&expectedOwner!==owner)fail('account_changed');
    const now=clock(this.now()),data=normalizeSavedProfileInput(value,{now}),storage=this.storage();
    const profiles=this.read(owner,storage),existing=id===null?null:profiles.find(profile=>profile.id===id);
    if(id!==null&&(!isUUID(id)||!existing))fail('not_found');
    const duplicate=profiles.find(profile=>signature(profile)===signature(data));
    if(duplicate) {
      if(existing&&duplicate.id!==existing.id)fail('duplicate');
      this.assertOwner(owner);
      return copy(duplicate);
    }
    if(!existing&&profiles.length>=SAVED_PROFILES_LIMIT)fail('limit');
    let profileId=existing?.id;
    if(!profileId) {
      try {profileId=this.createId();} catch {fail('storage_unavailable');}
      if(!isUUID(profileId))fail('storage_unavailable');
      profileId=profileId.toLowerCase();
      if(profiles.some(profile=>profile.id===profileId))fail('storage_unavailable');
    }
    const stamp=now.toISOString();
    const updatedAt=existing&&stamp<existing.updatedAt?existing.updatedAt:stamp;
    const profile={id:profileId,...data,createdAt:existing?.createdAt||stamp,updatedAt};
    this.write(owner,storage,[profile,...profiles.filter(item=>item.id!==profileId)]);
    return copy(profile);
  }

  remove(id,{expectedOwner=null}={}) {
    const owner=this.ownerId();
    if(expectedOwner!==null&&expectedOwner!==owner)fail('account_changed');
    if(!isUUID(id))fail('not_found');
    const storage=this.storage(),profiles=this.read(owner,storage),remaining=profiles.filter(profile=>profile.id!==id);
    if(remaining.length===profiles.length)return false;
    this.write(owner,storage,remaining);
    return true;
  }
}
