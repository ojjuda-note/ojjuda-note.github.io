import { CASE_01 } from './case-guides/case-01.js?v=20261114-tarot-copy1';
import { CASE_02 } from './case-guides/case-02.js?v=20261114-tarot-copy1';
import { CASE_03 } from './case-guides/case-03.js?v=20261114-tarot-copy1';
import { CASE_04 } from './case-guides/case-04.js?v=20261114-tarot-copy1';
import { CASE_05 } from './case-guides/case-05.js?v=20261114-tarot-copy1';
import { CASE_06 } from './case-guides/case-06.js?v=20261114-tarot-copy1';
import { CASE_07 } from './case-guides/case-07.js?v=20261114-tarot-copy1';
import { CASE_08 } from './case-guides/case-08.js?v=20261114-tarot-copy1';
import { CASE_09 } from './case-guides/case-09.js?v=20261114-tarot-copy1';
import { CASE_10 } from './case-guides/case-10.js?v=20261114-tarot-copy1';
import { CASE_11 } from './case-guides/case-11.js?v=20261114-tarot-copy1';
import { CASE_12 } from './case-guides/case-12.js?v=20261114-tarot-copy1';
import { CASE_13 } from './case-guides/case-13.js?v=20261114-tarot-copy1';
import { CASE_14 } from './case-guides/case-14.js?v=20261114-tarot-copy1';
import { CASE_15 } from './case-guides/case-15.js?v=20261114-tarot-copy1';
import { CASE_16 } from './case-guides/case-16.js?v=20261114-tarot-copy1';
import { CASE_17 } from './case-guides/case-17.js?v=20261114-tarot-copy1';
import { CASE_18 } from './case-guides/case-18.js?v=20261114-tarot-copy1';
import { CASE_19 } from './case-guides/case-19.js?v=20261114-tarot-copy1';
import { CASE_20 } from './case-guides/case-20.js?v=20261114-tarot-copy1';
import { CASE_21 } from './case-guides/case-21.js?v=20261114-tarot-copy1';
import { CASE_22 } from './case-guides/case-22.js?v=20261114-tarot-copy1';
import { CASE_23 } from './case-guides/case-23.js?v=20261114-tarot-copy1';
import { CASE_24 } from './case-guides/case-24.js?v=20261114-tarot-copy1';
import { CASE_25 } from './case-guides/case-25.js?v=20261114-tarot-copy1';
import { CASE_26 } from './case-guides/case-26.js?v=20261114-tarot-copy1';
import { CASE_27 } from './case-guides/case-27.js?v=20261114-tarot-copy1';
import { CASE_28 } from './case-guides/case-28.js?v=20261114-tarot-copy1';
import { CASE_29 } from './case-guides/case-29.js?v=20261114-tarot-copy1';
import { CASE_30 } from './case-guides/case-30.js?v=20261114-tarot-copy1';
import { CASE_31 } from './case-guides/case-31.js?v=20261114-tarot-copy1';
import { CASE_32 } from './case-guides/case-32.js?v=20261114-tarot-copy1';
import { CASE_33 } from './case-guides/case-33.js?v=20261114-tarot-copy1';
import { CASE_34 } from './case-guides/case-34.js?v=20261114-tarot-copy1';
import { CASE_35 } from './case-guides/case-35.js?v=20261114-tarot-copy1';
import { CASE_36 } from './case-guides/case-36.js?v=20261114-tarot-copy1';
import { CASE_37 } from './case-guides/case-37.js?v=20261114-tarot-copy1';
import { CASE_38 } from './case-guides/case-38.js?v=20261114-tarot-copy1';
import { CASE_39 } from './case-guides/case-39.js?v=20261114-tarot-copy1';
import { CASE_40 } from './case-guides/case-40.js?v=20261114-tarot-copy1';
import { CASE_41 } from './case-guides/case-41.js?v=20261114-tarot-copy1';
import { CASE_42 } from './case-guides/case-42.js?v=20261114-tarot-copy1';
import { CASE_43 } from './case-guides/case-43.js?v=20261114-tarot-copy1';
import { CASE_44 } from './case-guides/case-44.js?v=20261114-tarot-copy1';
import { CASE_45 } from './case-guides/case-45.js?v=20261114-tarot-copy1';
import { CASE_46 } from './case-guides/case-46.js?v=20261114-tarot-copy1';
import { CASE_47 } from './case-guides/case-47.js?v=20261114-tarot-copy1';
import { CASE_48 } from './case-guides/case-48.js?v=20261114-tarot-copy1';
import { CASE_49 } from './case-guides/case-49.js?v=20261114-tarot-copy1';
import { CASE_50 } from './case-guides/case-50.js?v=20261114-tarot-copy1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261113-tarot-easy1';

// Editorial applications of the existing card meanings, authored for each
// card/topic pair. They are not new historical sources or verified predictions.
// Each entry has its own insight and action: no pattern bucket, substitution
// template, random paraphrase, or generic fallback is used to fill missing cards.
const authoredCases = [
  CASE_01, CASE_02, CASE_03, CASE_04, CASE_05, CASE_06, CASE_07, CASE_08, CASE_09, CASE_10, CASE_11, CASE_12, CASE_13, CASE_14, CASE_15, CASE_16, CASE_17, CASE_18, CASE_19, CASE_20, CASE_21, CASE_22, CASE_23, CASE_24, CASE_25, CASE_26, CASE_27, CASE_28, CASE_29, CASE_30, CASE_31, CASE_32, CASE_33, CASE_34, CASE_35, CASE_36, CASE_37, CASE_38, CASE_39, CASE_40, CASE_41, CASE_42, CASE_43, CASE_44, CASE_45, CASE_46, CASE_47, CASE_48, CASE_49, CASE_50
];

export const CASE_GUIDES = Object.freeze(Object.fromEntries(authoredCases.map(entry => [
  entry.topicId,
  Object.freeze({
    ...entry,
    cards: Object.freeze(Object.fromEntries(Object.entries(entry.cards).map(([id, pair]) => [
      id, Object.freeze([...pair])
    ])))
  })
])));

export function getCaseGuide(topicId, cardId) {
  const topic = Object.hasOwn(CASE_GUIDES, topicId) ? CASE_GUIDES[topicId] : undefined;
  const pair = topic && Object.hasOwn(topic.cards, cardId) ? topic.cards[cardId] : undefined;
  if (!pair || pair.length !== 2 || pair.some(text => typeof text !== 'string' || !text.trim())) {
    throw new Error('tarot_case_requires_authored_card_and_topic');
  }
  return { id: `${topicId}:${cardId}`, insight: directInterpretation(pair[0]), action: directAction(pair[1]) };
}
