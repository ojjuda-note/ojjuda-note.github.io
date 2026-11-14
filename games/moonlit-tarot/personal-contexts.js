import { LOVE_CRUSH } from './personal-contexts/love-crush.js?v=20261114-tarot-person1';
import { LOVE_FLIRTING } from './personal-contexts/love-flirting.js?v=20261114-tarot-person1';
import { LOVE_DATING } from './personal-contexts/love-dating.js?v=20261114-tarot-person1';
import { LOVE_DISTANCE } from './personal-contexts/love-distance.js?v=20261114-tarot-person1';
import { LOVE_REUNION } from './personal-contexts/love-reunion.js?v=20261114-tarot-person1';
import { OVERALL_FAMILY } from './personal-contexts/overall-family.js?v=20261114-tarot-person1';
import { OVERALL_STUDY } from './personal-contexts/overall-study.js?v=20261114-tarot-person1';
import { OVERALL_CHANGE } from './personal-contexts/overall-change.js?v=20261114-tarot-person1';
import { WORK_JOB_SEARCH } from './personal-contexts/work-job-search.js?v=20261114-tarot-person1';
import { WORK_JOB_CHANGE } from './personal-contexts/work-job-change.js?v=20261114-tarot-person1';
import { WORK_TEAM } from './personal-contexts/work-team.js?v=20261114-tarot-person1';
import { WORK_BUSINESS } from './personal-contexts/work-business.js?v=20261114-tarot-person1';
import { MONEY_SPENDING } from './personal-contexts/money-spending.js?v=20261114-tarot-person1';
import { MONEY_SAVING } from './personal-contexts/money-saving.js?v=20261114-tarot-person1';
import { MONEY_AGREEMENT } from './personal-contexts/money-agreement.js?v=20261114-tarot-person1';

const authored = [
  OVERALL_FAMILY, OVERALL_STUDY, OVERALL_CHANGE,
  LOVE_CRUSH, LOVE_FLIRTING, LOVE_DATING, LOVE_DISTANCE, LOVE_REUNION,
  MONEY_SPENDING, MONEY_SAVING, MONEY_AGREEMENT,
  WORK_JOB_SEARCH, WORK_JOB_CHANGE, WORK_TEAM, WORK_BUSINESS
];

function freezeContext(entry) {
  return Object.freeze({
    ...entry,
    cards: Object.freeze({ ...entry.cards }),
    comparison: Object.freeze({
      ...entry.comparison,
      a: Object.freeze({ ...entry.comparison.a }),
      b: Object.freeze({ ...entry.comparison.b })
    }),
    followUps: Object.freeze(entry.followUps.map(item => Object.freeze({
      ...item, paragraphs: Object.freeze([...item.paragraphs])
    })))
  });
}

export const PERSONAL_CONTEXTS = Object.freeze(authored.map(freezeContext));
const byId = Object.freeze(Object.fromEntries(PERSONAL_CONTEXTS.map(item => [item.id, item])));
const topics = ['overall', 'love', 'money', 'work'];

export function listPersonalContexts(topicId) {
  if (!topics.includes(topicId)) throw new Error('tarot_personal_unknown_topic');
  return PERSONAL_CONTEXTS.filter(item => topicId === 'overall' || item.topicId === topicId);
}

export function getPersonalContext(topicId, contextId) {
  if (!topics.includes(topicId) || !Object.hasOwn(byId, contextId)
      || (topicId !== 'overall' && byId[contextId].topicId !== topicId)) {
    throw new Error('tarot_personal_context_mismatch');
  }
  return byId[contextId];
}
