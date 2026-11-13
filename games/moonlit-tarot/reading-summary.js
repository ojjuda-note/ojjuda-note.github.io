// Summaries select whole authored sentences. They never shorten a condition,
// remove a negative, or manufacture advice to fill a second line.
export function splitSummarySentences(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const pairs = { '‘': '’', '“': '”', '「': '」', '『': '』', '(': ')', '[': ']', '{': '}' };
  const stack = [];
  const sentences = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (stack.at(-1) === character) {
      stack.pop();
      continue;
    }
    if (Object.hasOwn(pairs, character)) {
      stack.push(pairs[character]);
      continue;
    }
    if ((character === '"' || character === "'")
        && !(character === "'" && /[\p{L}\p{N}]/u.test(text[index - 1] || '') && /[\p{L}\p{N}]/u.test(text[index + 1] || ''))) {
      stack.push(character);
      continue;
    }
    if (stack.length || !/[.!?。！？]/u.test(character)) continue;
    if (character === '.' && /\d/.test(text[index - 1] || '') && /\d/.test(text[index + 1] || '')) continue;
    if (index + 1 < text.length && !/\s/u.test(text[index + 1])) continue;
    const sentence = text.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    start = index + 1;
  }
  const remaining = text.slice(start).trim();
  if (remaining) sentences.push(remaining);
  return sentences;
}

function sentenceKey(sentence) {
  return sentence.replace(/[\s\p{P}]/gu, '');
}

/** The caller chooses two meaning-bearing fields, not a whole display body. */
export function summaryLinesFrom(first, second, alternatives = []) {
  const firstSentences = splitSummarySentences(first);
  const secondSentences = splitSummarySentences(second);
  const firstLine = firstSentences[0];
  if (!firstLine) throw new Error('tarot_summary_requires_two_authored_sentences');
  const candidates = [
    ...secondSentences,
    ...firstSentences.slice(1),
    ...alternatives.flatMap(splitSummarySentences)
  ];
  const secondLine = candidates.find(sentence => sentenceKey(sentence) !== sentenceKey(firstLine));
  if (!secondLine) throw new Error('tarot_summary_requires_two_distinct_sentences');
  return [firstLine, secondLine];
}
