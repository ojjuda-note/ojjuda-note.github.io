// Garu uses the Sejong tag set. Keep each distinct noun and verb in reading order.
export function parkWordTags(body, analyzer) {
  const tags = new Map();
  const add = value => {
    if (value && !tags.has(value.toLowerCase())) tags.set(value.toLowerCase(), value);
  };
  for (const match of String(body).matchAll(/#[\p{L}\p{N}_]+|[^#]+/gu)) {
    const part = match[0];
    if (part.startsWith('#')) {
      add(part.slice(1));
      continue;
    }
    let nominal = '', start = -1;
    for (const token of analyzer.analyze(part).tokens) {
      if (token.start !== start) nominal = '';
      start = token.start;
      if (/^(NNG|NNP|NNB|NNBC|SL|SH)$/.test(token.pos)) {
        add(token.text);
        nominal += token.text;
      } else {
        if (token.pos === 'VV' || token.pos === 'VX') add(token.text + '다');
        if (token.pos === 'XSV') add(nominal + token.text + '다');
        nominal = token.pos === 'XR' ? token.text : '';
      }
    }
  }
  return Array.from(tags.values());
}
