import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(fs.readFileSync(path.join(base,'events.json'),'utf8'));
const errors=[];const fail=msg=>errors.push(msg);
const regions=new Set(['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주']);
const categories=new Set(['local','campus','film','expo']);
const hasText=v=>typeof v==='string'&&!!v.trim();
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const validURL=v=>{try{return ['https:','http:'].includes(new URL(v).protocol);}catch{return false;}};
const validCoordinates=e=>Number.isFinite(e.lat)&&e.lat>=32&&e.lat<=39.5&&Number.isFinite(e.lng)&&e.lng>=124&&e.lng<=132;
if(data.schemaVersion!==1)fail('schemaVersion must be 1');
if(!validDate(data.updatedAt))fail('updatedAt must be an ISO date');
if(!Array.isArray(data.events)||!data.events.length)fail('events must be a nonempty array');
const ids=new Set();
for(const e of data.events||[]){
 const prefix=e.id||'(missing id)';
 if(typeof e.id!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(e.id))fail(prefix+': invalid id');
 if(ids.has(e.id))fail(prefix+': duplicate id');ids.add(e.id);
 for(const k of ['title','region','city','venue','summary','scheduleNote','priceNote','sourceName'])if(!hasText(e[k]))fail(prefix+': missing '+k);
 if(!categories.has(e.category))fail(prefix+': invalid category');
 if(!regions.has(e.region))fail(prefix+': invalid region');
 if(e.dateStatus===undefined||e.dateStatus==='confirmed'){
  if(!validDate(e.start)||!validDate(e.end)||e.end<e.start)fail(prefix+': invalid date range');
 }else if(e.dateStatus==='undecided'){
  if(e.start!==null||e.end!==null)fail(prefix+': undecided dates must both be explicit null');
  if(!hasText(e.dateNote))fail(prefix+': undecided dates require dateNote');
  if(!hasText(e.dateEvidence))fail(prefix+': undecided dates require official announcement evidence in dateEvidence');
 }else fail(prefix+': invalid dateStatus');
 if(!validDate(e.sourceCheckedAt)||e.sourceCheckedAt>data.updatedAt)fail(prefix+': invalid verification date');
 if(!validURL(e.sourceUrl))fail(prefix+': invalid source URL');
 if(e.locationStatus===undefined){
  if(!hasText(e.address))fail(prefix+': missing address');
  if(!validCoordinates(e))fail(prefix+': invalid Korean venue coordinates');
 }else if(e.locationStatus==='undecided'||e.locationStatus==='planned'){
  if(typeof e.address!=='string')fail(prefix+': address must be a string');
  const noCoordinates=e.lat===null&&e.lng===null;
  if(e.locationStatus==='undecided'&&!noCoordinates)fail(prefix+': undecided venue coordinates must both be explicit null');
  if(e.locationStatus==='planned'&&!noCoordinates&&!validCoordinates(e))fail(prefix+': planned venue requires valid Korean coordinates or explicit null for both');
 }else fail(prefix+': invalid locationStatus');
 if(typeof e.geoApprox!=='boolean')fail(prefix+': geoApprox must be boolean');
 if(!['scheduled','cancelled','postponed'].includes(e.status))fail(prefix+': invalid status');
 if(e.accessNote!=null&&typeof e.accessNote!=='string')fail(prefix+': invalid accessNote');
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`PASS: ${data.events.length} festivals, unique IDs, confirmed/undecided dates, venue coordinates, statuses and official-source fields`);
