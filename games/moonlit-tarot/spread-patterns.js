// Editorial selectors, not a count of independently written readings.
// A card has a different role in each position: current mind, unfolding theme,
// and useful response. The full card-specific nuances remain in readings.js.
export const PATTERN_AXES = Object.freeze({
  inner: Object.freeze(['새 출발·호기심', '바람·선택', '불확실함·걱정', '애착·익숙함', '책임·부담', '피로·정체', '상처·실망', '자립·거리', '자신감·성과', '재검토·깨달음']),
  flow: Object.freeze(['제안·기회', '만남·교류', '확인·발견', '충돌·어려움', '지연·기다림', '도움·협력', '변화·전환', '결실·마무리']),
  advice: Object.freeze(['작게 시도하기', '분명히 묻고 확인하기', '한계·기준 지키기', '도움을 주고받기', '속도 낮추기', '내려놓고 정리하기', '꾸준히 익히기', '받아들이고 소중히 여기기'])
});

// Each digit selects that card's theme only when it occupies that position.
// Difficult symbols retain conflict, hurt, delay and endings in these mappings.
export const CARD_PATTERNS = Object.freeze({
  fool: '000',            // beginning, opening, small experiment
  magician: '800',        // capability, opportunity, use available tools
  priestess: '221',       // the unspoken, discovery, listen and check
  empress: '357',         // nurture, support, value what grows
  emperor: '422',         // responsibility, structure, limits
  hierophant: '956',      // learning, guidance, practice
  lovers: '112',          // choice, relationship, values
  chariot: '862',         // resolve, movement, direction
  strength: '834',        // inner strength, difficulty, gentle restraint
  hermit: '744',          // solitude, pause, reflection
  wheel: '967',           // changed perspective, turning, acceptance
  justice: '921',         // assessment, evidence, fair inquiry
  hanged_man: '544',      // suspension, waiting, another perspective
  death: '965',           // recognition, transition, letting go
  temperance: '954',      // adjustment, cooperation, moderation
  devil: '332',           // attachment, constraint, boundaries
  tower: '635',           // shaken trust, disruption, remove weak foundations
  star: '100',            // hope, possibility, a small step
  moon: '221',            // uncertainty, hidden assumptions, verification
  sun: '877',             // confidence, fruition, appreciation
  judgement: '926',       // review, realization, put learning into practice
  world: '877',           // accomplishment, completion, integration

  wands_ace: '000',
  wands_two: '120',
  wands_three: '146',
  wands_four: '317',
  wands_five: '433',
  wands_six: '877',
  wands_seven: '432',
  wands_eight: '861',
  wands_nine: '544',
  wands_ten: '433',
  wands_page: '006',
  wands_knight: '860',
  wands_queen: '817',
  wands_king: '803',

  cups_ace: '010',
  cups_two: '113',
  cups_three: '317',
  cups_four: '544',
  cups_five: '637',
  cups_six: '357',
  cups_seven: '121',
  cups_eight: '765',
  cups_nine: '877',
  cups_ten: '317',
  cups_page: '010',
  cups_knight: '100',
  cups_queen: '352',
  cups_king: '413',

  swords_ace: '921',
  swords_two: '244',
  swords_three: '634',
  swords_four: '544',
  swords_five: '632',
  swords_six: '765',
  swords_seven: '221',
  swords_eight: '233',
  swords_nine: '241',
  swords_ten: '675',
  swords_page: '021',
  swords_knight: '864',
  swords_queen: '712',
  swords_king: '421',

  pentacles_ace: '000',
  pentacles_two: '442',
  pentacles_three: '453',
  pentacles_four: '342',
  pentacles_five: '633',
  pentacles_six: '353',
  pentacles_seven: '946',
  pentacles_eight: '406',
  pentacles_nine: '777',
  pentacles_ten: '377',
  pentacles_page: '006',
  pentacles_knight: '446',
  pentacles_queen: '453',
  pentacles_king: '472'
});

/** Reject missing/unknown/duplicate cards instead of inventing another reading. */
export function getSpreadPattern(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) throw new Error('tarot_spread_requires_three_cards');
  const ids = cards.map(card => typeof card === 'string' ? card : card?.id);
  if (new Set(ids).size !== 3 || ids.some(id => !Object.hasOwn(CARD_PATTERNS, id))) {
    throw new Error('tarot_spread_invalid_cards');
  }
  return ids.map((id, position) => CARD_PATTERNS[id][position]).join('');
}
