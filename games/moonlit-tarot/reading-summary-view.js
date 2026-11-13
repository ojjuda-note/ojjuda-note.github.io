const validLines = lines => Array.isArray(lines) && lines.length === 2
  && lines.every(line => typeof line === 'string' && line.trim());

// These are two complete meaning units, allowed to wrap on a narrow screen.
// Never clip a condition, warning, or the original explanation to fit a box.
export function appendSummaryLines(container, lines, { inline = false, setText, cardNames = [] } = {}) {
  if (!validLines(lines)) return null;
  const overview = document.createElement(inline ? 'span' : 'div');
  overview.className = 'reading-two-line-summary';
  overview.setAttribute('role', 'group');
  overview.setAttribute('aria-label', '두 줄 요약');
  for (const text of lines) {
    const line = document.createElement(inline ? 'span' : 'p');
    line.className = 'reading-summary-line';
    if (setText) setText(line, text, cardNames);
    else line.textContent = text;
    overview.append(line);
  }
  container.append(overview);
  return overview;
}

export function renderSectionSummary(section, part, { appendParagraphs, setText, cardNames = [] }) {
  if (!validLines(part.summaryLines)) {
    appendParagraphs(section, part.paragraphs, part.body || '', cardNames);
    return;
  }
  appendSummaryLines(section, part.summaryLines, { setText, cardNames });
  const details = document.createElement('details');
  details.className = 'reading-summary-details';
  const toggle = document.createElement('summary');
  toggle.textContent = '자세히 읽기';
  details.append(toggle);
  const original = document.createElement('div');
  original.className = 'reading-summary-full';
  const subtitle = section.querySelector('.reading-part-subtitle');
  if (subtitle) original.append(subtitle);
  appendParagraphs(original, part.paragraphs, part.body || '', cardNames);
  details.append(original);
  section.append(details);
}

export function installSummaryExpiryGuard(expireReading) {
  const target = document.getElementById('summary-text');
  const guard = event => {
    if (!event.target.closest?.('summary')) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
    if (expireReading()) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  target.addEventListener('click', guard, true);
  target.addEventListener('keydown', guard, true);
}
