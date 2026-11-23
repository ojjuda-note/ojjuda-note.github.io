// PostgreSQL counts Unicode code points. One saved mask occupies one input
// character, so text remains editable after the server replaces forbidden spans.
export function maskedTextLength(value) {
  return [...String(value ?? '').replaceAll('❤️❤️', '♥')].length;
}

// HTML maxlength counts UTF-16 units, including both hearts and variation selectors.
export function textInputMaxLength(value, limit) {
  const text = String(value ?? '');
  return limit + text.length - maskedTextLength(text);
}
