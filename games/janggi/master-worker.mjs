import { analyzeJanggiMasterMove, JANGGI_LEVELS } from './master-ai.mjs?v=20261128-janggi-levels1';
import { warmOpeningBook } from './opening-book.mjs?v=20261115-janggi-book1';
import { searchRules } from './search-rules.mjs?v=20261115-janggi-search1';
import { createNeuralPlayer } from './neural-player.mjs?v=20261115-janggi-book1';

const neural=createNeuralPlayer();
self.onmessage = async ({ data }) => {
 const requestId = data?.requestId;
 try {
  const config=JANGGI_LEVELS[data?.level];
  if (!config) throw new Error('알 수 없는 AI 난이도');
  if (!Array.isArray(data?.state?.b) || data.state.b.length !== 90) throw new Error('잘못된 장기판');
  const started=Date.now(),budgetMs=Math.max(60,Math.min(config.budgetMs,Number(data.budgetMs)||config.budgetMs));
  if(config.openingMargin && data.state.n<16)warmOpeningBook();
  // Introduce the trained engine gradually above hard.
  const useNeural=typeof Worker==='function' && Math.random()<config.neuralChance;
  const learned=useNeural ? await neural.choose(data.state,data.level,searchRules,budgetMs) : null;
  if(learned){
   self.postMessage({requestId,move:learned,engine:'nnue'});return;
  }
  const analysis=analyzeJanggiMasterMove(data.state,searchRules,{
   level:data.level,budgetMs:Math.max(80,budgetMs-(Date.now()-started))
  });
  self.postMessage({requestId,...analysis,engine:'search'});
 } catch (error) {
  self.postMessage({ requestId, error: String(error?.message || error) });
 }
};
