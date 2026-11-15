import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {catalogRoot,loadDrinkingCatalog,validateDrinkingCatalog} from './lib/drinking-catalogs.mjs';
import {reviewedFlavorCatalog} from './build-drinking-flavor500-reread.mjs';
import {wordingUpdateBlock} from './build-drinking-polish.mjs';

export function kingPairMovePlan(){
  const catalog=reviewedFlavorCatalog('king');
  const file=path.join(catalogRoot,'games/drinking/content/expansions/king-pair-moves.json');
  const moves=JSON.parse(fs.readFileSync(file,'utf8'));
  const edits=[];
  for(const flavor of ['mild','spicy']){
    const pairs=moves[flavor];
    if(!Array.isArray(pairs)||pairs.length!==250||pairs.some(text=>typeof text!=='string'||!text.startsWith('둘이 ')))throw Error('Expected 250 two-person missions for '+flavor);
    let next=0;
    catalog[flavor]=catalog[flavor].map(from=>{
      if(!from.startsWith('둘이 '))return from;
      const to=pairs[next++];
      if(to!==from)edits.push({flavor,from,to});
      return to;
    });
    if(next!==pairs.length)throw Error('King pair slot count changed');
  }
  const legacyEdits=[];
  const legacy=loadDrinkingCatalog('king').map(from=>{
    if(!from.startsWith('둘이 '))return from;
    const card=moves.legacy[legacyEdits.length];
    if(!card?.text?.startsWith('둘이 ')||!['mild','spicy'].includes(card.flavor))throw Error('Invalid legacy pair mission');
    legacyEdits.push({from,to:card.text,flavor:card.flavor});
    return card.text;
  });
  if(legacyEdits.length!==182||moves.legacy.length!==legacyEdits.length)throw Error('Legacy pair count changed');
  validateDrinkingCatalog('king',[...legacy,...catalog.mild,...catalog.spicy]);
  return {catalog,edits,legacy,legacyEdits};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const {edits,legacyEdits}=kingPairMovePlan();
  const sql=['-- Update two-person king missions in place. Dealt rooms keep their own mission text.',
    'begin;','select pg_advisory_xact_lock(24613,911);',wordingUpdateBlock('king',edits,{labeled:true}),
    wordingUpdateBlock('king',legacyEdits,{promoteUnlabeled:true}),'commit;',''].join('\n');
  const directory=path.join(catalogRoot,'supabase/migrations');
  const files=fs.readdirSync(directory).filter(name=>name.endsWith('_drinking_king_pair_moves.sql'));
  if(files.length!==1)throw Error('Expected one king pair mission migration');
  const migration=path.join(directory,files[0]);
  if(process.argv.includes('--check')){
    if(fs.readFileSync(migration,'utf8')!==sql)throw Error('King mission migration differs from the catalog');
  }else fs.writeFileSync(migration,sql);
}
