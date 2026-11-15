import { analyzeJanggiMasterMove } from './master-ai.mjs?v=20261115-janggi-search1';
import { searchRules } from './search-rules.mjs?v=20261115-janggi-search1';

// Also used when a device cannot start the background worker.
export function chooseJanggiProMove(state, rules=searchRules, budgetMs=2700) {
 return analyzeJanggiMasterMove(state,rules,{level:'pro',budgetMs}).move;
}
