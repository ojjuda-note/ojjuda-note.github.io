import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const drinkingKinds=Object.freeze(['liar','king','minority','mission','bomb','truth','fingers','imagevote','initial']);
export const catalogRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const initialLetters='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const initialPattern=/^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$/u;
const wordPattern=/^[가-힣]{2}$/u;
export const isPairKind=kind=>kind==='minority'||kind==='mission';
export const canonicalText=text=>text.normalize('NFKC').replace(/\s+/gu,'').toLowerCase();
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));

export function initialKey(text){
  if(typeof text!=='string')return null;
  if(initialPattern.test(text))return text;
  if(!wordPattern.test(text))return null;
  return [...text].map(letter=>initialLetters[Math.floor((letter.codePointAt(0)-0xac00)/588)]).join('');
}

export function entryIdentity(kind,entry){
  return JSON.stringify(kind==='truth'?[entry.flavor,entry.body]:entry);
}

export function validateDrinkingCatalog(kind,entries){
  if(!drinkingKinds.includes(kind)||!Array.isArray(entries))throw Error('Invalid drinking catalog');
  const seen=new Set();
  for(const entry of entries){
    if(kind==='truth'&&(!entry||Array.isArray(entry)||!['mild','spicy'].includes(entry.flavor)))throw Error('Invalid truth flavor');
    const parts=isPairKind(kind)?entry:[kind==='truth'?entry.body:entry];
    if(!Array.isArray(parts)||parts.length!==(isPairKind(kind)?2:1))throw Error('Invalid choice pair');
    for(const text of parts){
      if(typeof text!=='string'||!text||text!==text.trim()||text!==text.normalize('NFC')
        ||/\s{2,}|[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text)
        ||[...text].length>(kind==='king'?80:kind==='truth'?240:120))throw Error('Invalid wording: '+String(text));
      if(kind==='initial'&&!initialKey(text))throw Error('Invalid initial word: '+text);
    }
    const normalized=parts.map(canonicalText);
    if(isPairKind(kind)&&normalized[0]===normalized[1])throw Error('Identical choices');
    const key=JSON.stringify(isPairKind(kind)?normalized.sort():normalized);
    if(seen.has(key))throw Error('Repeated catalog wording: '+key);
    seen.add(key);
  }
  return entries;
}

export function applyDrinkingCorrections(kind,entries,corrections){
  const originals=new Map(entries.map(entry=>[entryIdentity(kind,entry),entry]));
  const replacements=new Map();
  if(originals.size!==entries.length)throw Error('The original catalog contains duplicate rows');
  if(!Array.isArray(corrections))throw Error('Invalid correction list');
  for(const correction of corrections){
    if(!correction||!Object.hasOwn(correction,'from')||!Object.hasOwn(correction,'to'))throw Error('Each correction needs from and to');
    validateDrinkingCatalog(kind,[correction.from]);
    validateDrinkingCatalog(kind,[correction.to]);
    const from=entryIdentity(kind,correction.from),to=entryIdentity(kind,correction.to);
    if(!originals.has(from))throw Error('Correction does not match an existing entry: '+from);
    if(replacements.has(from))throw Error('Correct the same entry only once: '+from);
    if(from===to)throw Error('List changed entries only: '+from);
    if(kind==='king'&&correction.from.startsWith('둘이 ')!==correction.to.startsWith('둘이 '))throw Error('Preserve solo/two-person king mission classification');
    if(kind==='truth'&&correction.from.flavor!==correction.to.flavor)throw Error('Preserve each truth question flavor');
    replacements.set(from,correction.to);
  }
  return validateDrinkingCatalog(kind,entries.map(entry=>replacements.get(entryIdentity(kind,entry))??entry));
}

export function loadDrinkingPolish(kind,{root=catalogRoot}={}){
  if(!drinkingKinds.includes(kind))throw Error('Choose one drinking game catalog');
  const file=path.join(root,'games/drinking/content/corrections/natural1',kind+'.json');
  if(!fs.existsSync(file))return null;
  const correction=readJson(file);
  if(correction.kind!==kind||correction.release!=='natural1'||!Array.isArray(correction.entries))throw Error('Invalid natural1 correction manifest: '+kind);
  return correction;
}

// Historical SQL assertions use includePolish:false. Static client assertions
// use the default so that old migration tests do not freeze today's wording.
export function loadDrinkingCatalog(kind,{root=catalogRoot,includePolish=true}={}){
  if(!drinkingKinds.includes(kind))throw Error('Choose one drinking game catalog');
  const directory=path.join(root,'games/drinking/content');
  const base=readJson(path.join(directory,kind+'.json'));
  const expansion=readJson(path.join(directory,'expansions/party300',kind+'.json'));
  if(base.kind!==kind||expansion.kind!==kind||expansion.release!=='party300')throw Error('Catalog kind/release mismatch');
  let entries=base.entries;
  if(kind==='bomb'){
    const correction=readJson(path.join(directory,'corrections/bomb-quick-categories.json'));
    if(correction.kind!==kind||correction.entries.length!==entries.length)throw Error('Bomb correction must cover its complete original catalog');
    entries=applyDrinkingCorrections(kind,entries,correction.entries);
  }
  entries=validateDrinkingCatalog(kind,[...entries,...expansion.entries]);
  const correction=includePolish?loadDrinkingPolish(kind,{root}):null;
  return correction?applyDrinkingCorrections(kind,entries,correction.entries):entries;
}
