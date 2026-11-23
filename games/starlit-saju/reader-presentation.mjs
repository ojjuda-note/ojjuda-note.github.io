const SUMMARY = '.saju-two-line-summary, .compatibility-two-line-summary';
const NOTICE = '.reader-scope-note, .result-warnings, .daeun-time-notice, [role="alert"]';

function storyDetails(doc) {
  const details = doc.createElement('details');
  details.className = 'reading-story-details';
  const toggle = doc.createElement('summary');
  toggle.className = 'reading-story-toggle';
  toggle.textContent = '자세히 읽기';
  details.append(toggle);
  return details;
}

/** Keep authored prose intact, with its existing summary and notices in view. */
export function presentReadingStories(root) {
  for (const prose of [...root.querySelectorAll('.reader-prose')]) {
    if (prose.closest('.reading-story-details') || prose.querySelector(':scope > .reading-story-details')) continue;
    const ownSummary = [...prose.children].find(child => child.matches(SUMMARY));
    if (ownSummary) {
      // The decade introduction owns both its summary and its paragraphs. Keep
      // that stable container, moving only the complete authored explanation.
      const content = [...prose.children].filter(child =>
        child.matches('p, .reading-body-heading') && !child.matches(NOTICE)
        && !child.matches('.reader-headline, .reader-label, .saju-summary-line, .compatibility-summary-line'));
      if (!content.length) continue;
      const details = storyDetails(prose.ownerDocument);
      details.classList.add('report-prose', 'reader-prose', 'reading-story-inline');
      content[0].before(details);
      details.append(...content);
      continue;
    }
    const summary = [...(prose.parentElement?.children || [])].find(child => child.matches(SUMMARY));
    // A heading alone is not a replacement for an unsummarized explanation.
    if (!summary || !summary.textContent.trim() || !prose.textContent.trim()) continue;
    const details = storyDetails(prose.ownerDocument);
    for (const {name, value} of [...prose.attributes]) details.setAttribute(name, value);
    details.classList.add('reading-story-details');
    details.append(...prose.childNodes);
    prose.replaceWith(details);
    // Notices remain readable even when a future renderer places one in prose.
    for (const notice of [...details.children].filter(child => child.matches(NOTICE))) details.before(notice);
  }
}

/** The bar follows the same available reading sequence as the visible counter. */
export function createReadingProgress(doc, label = '읽기 진행') {
  const element = doc.createElement('div');
  element.className = 'reading-progress';
  element.setAttribute('role', 'progressbar');
  element.setAttribute('aria-label', label);
  element.setAttribute('aria-valuemin', '0');
  const fill = doc.createElement('span');
  fill.className = 'reading-progress-fill';
  fill.setAttribute('aria-hidden', 'true');
  element.append(fill);
  return {element, update(position, total, text) {
    const valid = Number.isInteger(position) && Number.isInteger(total) && position > 0 && position <= total;
    element.hidden = !valid;
    if (!valid) return;
    element.setAttribute('aria-valuemax', String(total));
    element.setAttribute('aria-valuenow', String(position));
    element.setAttribute('aria-valuetext', text || `${total}개 중 ${position}번째`);
    fill.style.width = `${position / total * 100}%`;
  }};
}
