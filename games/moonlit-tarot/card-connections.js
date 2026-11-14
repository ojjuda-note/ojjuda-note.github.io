import { CONNECTION_PROFILES, getConnectionProfile as lookupConnectionProfile } from './connection-profiles.js?v=20261114-tarot-review2';
import { buildPersonNarrative } from './person-narrative.js?v=20261114-tarot-review2';

// The same actual-card relationship reader serves the main and situation views.
export function getConnectionProfile(cardId) {
  return lookupConnectionProfile(cardId);
}

export function buildCardConnections({ cards, context, names } = {}) {
  if (!Array.isArray(cards) || cards.length !== 3
      || new Set(cards.map(card => card?.id)).size !== 3
      || cards.some(card => !card || typeof card.name !== 'string' || !card.name.trim()
        || !Object.hasOwn(CONNECTION_PROFILES, card.id))) {
    throw new Error('tarot_connections_require_three_actual_cards');
  }
  if (!context || ['concern', 'boundary'].some(field => typeof context[field] !== 'string' || !context[field].trim())) {
    throw new Error('tarot_connections_require_context');
  }
  const displayNames = names === undefined ? cards.map(card => card.name.trim()) : names;
  if (!Array.isArray(displayNames) || displayNames.length !== 3
      || displayNames.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('tarot_connections_require_three_names');
  }
  return buildPersonNarrative({ cards, context, names: displayNames, topicId: context.topicId || 'overall' });
}
