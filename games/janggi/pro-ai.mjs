import { analyzeJanggiMasterMove, JANGGI_LEVELS } from './master-ai.mjs?v=20261128-janggi-levels1';
import { warmOpeningBook } from './opening-book.mjs?v=20261115-janggi-book1';
import { searchRules } from './search-rules.mjs?v=20261115-janggi-search1';

// Also used when a device cannot start the background worker.
export function chooseJanggiProMove(state, rules=searchRules, budgetMs=2700, level='pro') {
 const config=JANGGI_LEVELS[level] || JANGGI_LEVELS.pro;
 if(config.openingMargin && state.n<16)warmOpeningBook();
 return analyzeJanggiMasterMove(state,rules,{level,budgetMs:Math.min(config.budgetMs,budgetMs)}).move;
}
