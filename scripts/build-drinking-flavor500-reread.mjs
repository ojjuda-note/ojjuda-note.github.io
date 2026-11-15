import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {catalogRoot,applyDrinkingCorrections,loadDrinkingCatalog,validateDrinkingCatalog} from './lib/drinking-catalogs.mjs';
import {wordingUpdateBlock} from './build-drinking-polish.mjs';

const games=['king','truth','minority','imagevote','fingers'];
const content=path.join(catalogRoot,'games/drinking/content');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const corrections=()=>read(path.join(content,'corrections/flavor500-reread.json'));
const card=(kind,flavor,text)=>kind==='truth'?{flavor,body:text}:text;
const editsForSql=(kind,edits)=>edits.map(({flavor,from,to})=>({
  flavor,from:card(kind,flavor,from),to:card(kind,flavor,to)
}));

export function reviewedFlavorCatalog(kind,edits=corrections()[kind]){
  const bank=read(path.join(content,'expansions/flavor500',kind+'.json'));
  if(!Array.isArray(edits)||edits.some(edit=>!Object.hasOwn(bank,edit.flavor)))throw Error('Invalid correction flavor for '+kind);
  const combined=[];
  for(const flavor of ['mild','spicy']){
    const original=bank[flavor].map(text=>card(kind,flavor,text));
    const changed=applyDrinkingCorrections(kind,original,editsForSql(kind,edits.filter(edit=>edit.flavor===flavor)));
    combined.push(...changed);
    bank[flavor]=changed.map(entry=>kind==='truth'?entry.body:entry);
    if(bank[flavor].length!==500)throw Error('Expected 500 '+kind+' '+flavor+' cards');
    if(kind==='king'&&bank[flavor].filter(s=>s.startsWith('둘이 ')).length!==250)throw Error('Wrong king recipient count');
    if(kind==='fingers'&&bank[flavor].some(s=>!s.endsWith('사람 접어')))throw Error('Invalid finger condition');
    if(['imagevote','truth'].includes(kind)&&bank[flavor].some(s=>!s.endsWith('?')))throw Error('Invalid question');
    if(kind==='minority'&&bank[flavor].some(pair=>pair.some(side=>side.length>80)))throw Error('Minority ballot exceeds game limit');
  }
  validateDrinkingCatalog(kind,[...loadDrinkingCatalog(kind),...combined]);
  return bank;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const changes=corrections();
  const blocks=[];
  for(const kind of games){
    reviewedFlavorCatalog(kind,changes[kind]);
    if(changes[kind].length)blocks.push(wordingUpdateBlock(kind,editsForSql(kind,changes[kind]),{labeled:true}));
  }
  const sql=['-- Apply reviewed wording to existing flavor500 cards without changing live rounds.',
    'begin;','select pg_advisory_xact_lock(24613,911);',...blocks,'commit;',''].join('\n');
  const directory=path.join(catalogRoot,'supabase/migrations');
  const matches=fs.readdirSync(directory).filter(file=>file.endsWith('_drinking_flavor500_reread.sql'));
  if(matches.length!==1)throw Error('Expected one wording migration');
  const file=path.join(directory,matches[0]);
  const client=path.join(catalogRoot,'games/drinking/community-prompts.js');
  const marker='// Superseded flavor500 questions must stay out of saved personal decks.';
  const oldSource=fs.readFileSync(client,'utf8');
  const prefix=oldSource.split(marker)[0].trimEnd();
  const retired=JSON.stringify(changes.truth.map(edit=>edit.from),null,2);
  const source=prefix+'\n\n'+marker+'\nwindow.DrinkingPromptCatalog.retiredTruth.push(...'+retired+');\n';
  for(const [target,expected] of [[file,sql],[client,source]]){
    if(process.argv.includes('--check')){
      if(fs.readFileSync(target,'utf8')!==expected)throw Error('Reviewed changes differ from '+target);
    }else fs.writeFileSync(target,expected);
  }
}
