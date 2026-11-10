import { analyzeJanggiMasterMove, MASTER_LEVELS } from './master-ai.mjs';
import { janggiRules } from './worker-rules.mjs?v=20261110-janggi-replay1';

self.onmessage = ({ data }) => {
 const requestId = data?.requestId;
 try {
  if (!MASTER_LEVELS[data?.level]) throw new Error('알 수 없는 AI 난이도');
  if (!Array.isArray(data?.state?.b) || data.state.b.length !== 90) throw new Error('잘못된 장기판');
  const analysis = analyzeJanggiMasterMove(data.state, janggiRules, {
   level: data.level,
   budgetMs: data.budgetMs
  });
  self.postMessage({ requestId, ...analysis });
 } catch (error) {
  self.postMessage({ requestId, error: String(error?.message || error) });
 }
};
