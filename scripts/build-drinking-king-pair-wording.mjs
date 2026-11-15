import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {kingPairMovePlan} from './build-drinking-king-pair-moves.mjs';
import {wordingUpdateBlock} from './build-drinking-polish.mjs';
import {applyDrinkingCorrections,catalogRoot,validateDrinkingCatalog} from './lib/drinking-catalogs.mjs';

export function reviewedKingPairPlan(){
  const {catalog,legacy,legacyEdits}=kingPairMovePlan();
  const file=path.join(catalogRoot,'games/drinking/content/corrections/king-pair-wording.json');
  const changes=JSON.parse(fs.readFileSync(file,'utf8'));
  const legacyFlavors=new Map(legacyEdits.map(card=>[card.to,card.flavor]));
  const edits=[];
  function revise(cards,group){
    for(const {from,to} of changes[group]){
      if(!from.startsWith('둘이 ')||!to.startsWith('둘이 ')||!to.endsWith('.'))throw Error('Expected two-person action');
      edits.push({from,to,flavor:group==='legacy'?legacyFlavors.get(from):group});
    }
    return applyDrinkingCorrections('king',cards,changes[group]);
  }
  for(const flavor of ['mild','spicy'])catalog[flavor]=revise(catalog[flavor],flavor);
  const updatedLegacy=revise(legacy,'legacy');
  const legacyPairs=updatedLegacy.filter(text=>text.startsWith('둘이 '));
  const reviewedLegacy=legacyEdits.map((edit,i)=>({...edit,to:legacyPairs[i]}));
  validateDrinkingCatalog('king',[...updatedLegacy,...catalog.mild,...catalog.spicy]);
  return {catalog,legacy:updatedLegacy,legacyEdits:reviewedLegacy,edits};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const {edits}=reviewedKingPairPlan();
  const sql=['-- Update only the wording of reviewed two-person king missions.',
    'begin;','select pg_advisory_xact_lock(24613,911);',wordingUpdateBlock('king',edits,{labeled:true}),'commit;',''].join('\n');
  const dir=path.join(catalogRoot,'supabase/migrations');
  const matches=fs.readdirSync(dir).filter(file=>file.endsWith('_drinking_king_pair_wording.sql'));
  if(matches.length!==1)throw Error('Expected one king pair wording migration');
  const migration=path.join(dir,matches[0]);
  if(process.argv.includes('--check')){
    if(fs.readFileSync(migration,'utf8')!==sql)throw Error('Migration differs from the reviewed missions');
  }else fs.writeFileSync(migration,sql);
}
