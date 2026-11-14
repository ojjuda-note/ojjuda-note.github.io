import { MAJOR_PERSON_STORIES } from './person-stories-major.js?v=20261114-tarot-review2';
import { WANDS_PERSON_STORIES } from './person-stories-wands.js?v=20261114-tarot-review2';
import { CUPS_PERSON_STORIES } from './person-stories-cups.js?v=20261114-tarot-copy1';
import { SWORDS_PERSON_STORIES } from './person-stories-swords.js?v=20261114-tarot-review3';
import { PENTACLES_PERSON_STORIES } from './person-stories-pentacles.js?v=20261114-tarot-review2';

// Authored readings of the actual cards. These describe a symbolic portrait;
// they do not establish the reader's history, personality or future as fact.
// Whole sentences are retained: no topic nouns or verb endings are substituted.
export const CARD_PERSON_STORIES = Object.freeze({
  ...MAJOR_PERSON_STORIES, ...WANDS_PERSON_STORIES, ...CUPS_PERSON_STORIES,
  ...SWORDS_PERSON_STORIES, ...PENTACLES_PERSON_STORIES
});

export function getPersonStory(cardId) {
  if (!Object.hasOwn(CARD_PERSON_STORIES, cardId)) throw new Error('tarot_person_story_requires_actual_card');
  return CARD_PERSON_STORIES[cardId];
}
