import { analyzeJanggiMasterMove } from './master-ai.mjs?v=20261115-janggi-book1';
import { warmOpeningBook } from './opening-book.mjs?v=20261115-janggi-book1';
import { searchRules } from './search-rules.mjs?v=20261115-janggi-search1';

warmOpeningBook();

// Also used when a device cannot start the background worker.
export function chooseJanggiProMove(state, rules=searchRules, budgetMs=2700) {
 return analyzeJanggiMasterMove(state,rules,{level:'pro',budgetMs}).move;
}
