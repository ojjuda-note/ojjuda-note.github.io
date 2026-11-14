import { listPersonalContexts } from './personal-contexts.js?v=20261114-tarot-person1';
import { buildPersonalReading, personalReadingCopyLines, PERSONAL_BASIS } from './personal-reading.js?v=20261114-tarot-person1';
import { appendSummaryLines } from './reading-summary-view.js?v=20261113-tarot-summary1';

// This view only reinterprets the three already revealed cards. It does not
// start a purchase, draw a card, change a receipt, or extend its expiry.
export function createPersonalReading({ getSnapshot, canRead, renderSections, renderText, selectGroup }) {
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let topicId = null;
  let selectedId = '';
  let panel = null;
  let report = null;
  let currentCards = [];

  const intro = element('div', 'personal-context-picker');
  const introLabel = element('label', '', '지금 내 상황');
  introLabel.htmlFor = 'intro-context-select';
  introLabel.append(element('span', 'personal-optional', '선택'));
  const introSelect = element('select');
  introSelect.id = 'intro-context-select';
  intro.append(introLabel, introSelect);
  document.getElementById('topics').after(intro);

  function fillOptions(select) {
    select.replaceChildren();
    const placeholder = element('option', '', '상황을 골라 보세요');
    placeholder.value = '';
    select.append(placeholder);
    const labels = { overall: '생활·가족·학업', love: '연애와 관계', money: '돈과 생활', work: '일과 도전' };
    const groups = new Map();
    for (const context of listPersonalContexts(topicId)) {
      const option = element('option', '', context.label);
      option.value = context.id;
      if (topicId === 'overall') {
        if (!groups.has(context.topicId)) {
          const group = element('optgroup');
          group.label = labels[context.topicId];
          groups.set(context.topicId, group);
          select.append(group);
        }
        groups.get(context.topicId).append(option);
      } else select.append(option);
    }
    select.value = selectedId;
  }

  function syncTopic() {
    const snapshot = getSnapshot();
    if (snapshot.topicId !== topicId) {
      topicId = snapshot.topicId;
      selectedId = '';
      report = null;
      fillOptions(introSelect);
    }
    introSelect.disabled = snapshot.phase !== 'intro' || !!snapshot.busy;
    introSelect.value = selectedId;
  }

  function readable() {
    if (!canRead()) return false;
    const snapshot = getSnapshot();
    return snapshot.complete && snapshot.topicId === topicId
      && snapshot.cards.length === 3
      && snapshot.cards.every((card, index) => card.id === currentCards[index]?.id);
  }

  function choose(value) {
    selectedId = listPersonalContexts(topicId).some(item => item.id === value) ? value : '';
    introSelect.value = selectedId;
  }

  function renderComparison(target, data) {
    const details = element('details', 'personal-disclosure personal-comparison');
    details.id = 'personal-comparison';
    const summary = element('summary', '', '두 선택 비교');
    appendSummaryLines(summary, data.options.map(option => `${option.key.toUpperCase()}. ${option.label}`), { inline: true });
    details.append(summary);
    const body = element('div', 'personal-disclosure-body');
    body.append(element('h4', 'personal-comparison-title', data.title));
    const basis = element('div', 'personal-comparison-basis');
    renderSections(basis, [{ title: '카드가 짚어 주는 선택 기준', paragraphs: [data.basis], summaryLines: data.basisSummaryLines }], '', 'h4', currentCards.map(card => card.name));
    body.append(basis);
    const choices = element('div', 'personal-choice-grid');
    for (const option of data.options) {
      const article = element('article', 'personal-choice');
      article.id = option.id;
      const title = element('h4');
      title.append(element('span', 'personal-choice-letter', option.key.toUpperCase()), document.createTextNode(option.label));
      article.append(title);
      appendSummaryLines(article, option.summaryLines);
      const original = element('details', 'reading-summary-details');
      original.append(element('summary', '', '자세히 읽기'));
      const list = element('dl');
      for (const [key, label] of [['gain', '이 선택의 장점'], ['burden', '감수할 부담'], ['prepare', '먼저 준비할 것']]) {
        list.append(element('dt', '', label), element('dd', '', option[key]));
      }
      original.append(list);
      article.append(original);
      choices.append(article);
    }
    body.append(choices);
    details.append(body);
    target.append(details);
  }

  function renderPanel() {
    if (!panel || !readable()) return;
    report = selectedId ? buildPersonalReading({ cards: currentCards, topicId, contextId: selectedId }) : null;
    panel.replaceChildren();
    const picker = element('div', 'personal-context-picker personal-result-picker');
    const label = element('label', '', '지금 내 상황');
    label.htmlFor = 'result-context-select';
    const select = element('select');
    select.id = 'result-context-select';
    fillOptions(select);
    select.addEventListener('change', () => {
      if (!readable()) return;
      choose(select.value);
      renderPanel();
      panel?.querySelector('#result-context-select')?.focus();
    });
    picker.append(label, select);
    panel.append(picker);
    if (!report) {
      panel.append(element('p', 'personal-empty', '고민과 가까운 상황을 고르면 세 장의 연결과 두 선택을 함께 살펴볼 수 있어요.'));
      return;
    }
    const criteria = element('details', 'reading-source personal-basis');
    criteria.id = 'personal-basis';
    criteria.append(element('summary', '', '풀이 기준과 상황 예시'), element('p', '', PERSONAL_BASIS), element('p', 'personal-example', report.example));
    panel.append(criteria);
    const reading = element('div', 'personal-reading');
    reading.id = 'personal-reading';
    reading.append(element('h3', 'personal-main-question', report.question));
    const links = element('div', 'personal-card-connections');
    links.id = 'personal-card-connections';
    renderSections(links, [report.connection], '', 'h3', currentCards.map(card => card.name));
    reading.append(links);
    const sections = element('div', 'personal-card-guides');
    renderSections(sections, report.primary, '', 'h3', currentCards.map(card => card.name));
    reading.append(sections);
    renderComparison(reading, report.comparison);
    const following = element('section', 'personal-followups');
    following.id = 'personal-followups';
    following.append(element('h3', '', '이어지는 질문'));
    for (const question of report.followUps) {
      const details = element('details', 'personal-disclosure personal-followup');
      details.id = question.id;
      const questionTitle = element('summary', '', question.title);
      appendSummaryLines(questionTitle, question.summaryLines, { inline: true, setText: renderText, cardNames: currentCards.map(card => card.name) });
      details.append(questionTitle);
      const answer = element('div', 'personal-disclosure-body personal-answer');
      renderSections(answer, [{ title: '이렇게 살펴보세요', paragraphs: question.paragraphs }], '', 'h4', currentCards.map(card => card.name));
      details.append(answer);
      following.append(details);
    }
    reading.append(following);
    panel.append(reading);
  }

  introSelect.addEventListener('change', () => {
    if (introSelect.disabled || getSnapshot().phase !== 'intro') return;
    const value = introSelect.value;
    syncTopic();
    choose(value);
  });
  document.getElementById('topics').addEventListener('click', event => {
    if (event.target.closest?.('[data-topic]')) syncTopic();
  });
  syncTopic();

  return {
    syncTopic,
    mount({ cards, topicId: actualTopic }) {
      syncTopic();
      currentCards = cards;
      if (actualTopic !== topicId || !readable()) return false;
      const tabs = document.getElementById('summary-tabs');
      const panels = document.getElementById('summary-text');
      const tab = element('button', '', '내 상황');
      tab.type = 'button';
      tab.id = 'summary-tab-personal';
      tab.dataset.group = 'personal';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'summary-panel-personal');
      tab.setAttribute('aria-selected', 'false');
      tab.tabIndex = -1;
      panel = element('div', 'summary-panel personal-panel');
      panel.id = 'summary-panel-personal';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      panel.hidden = true;
      // Capture the native details/selection action too, so a suspended expiry
      // timer cannot leave an old answer open through a new control.
      panel.addEventListener('click', event => {
        if (!readable()) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      tabs.append(tab);
      panels.append(panel);
      tabs.classList.add('has-personal-reading');
      renderPanel();
      if (selectedId) selectGroup('personal');
      return true;
    },
    copyLines() {
      return readable() ? personalReadingCopyLines(report) : [];
    },
    reset() {
      selectedId = '';
      report = null;
      currentCards = [];
      panel = null;
      introSelect.value = '';
      document.getElementById('summary-tab-personal')?.remove();
      document.getElementById('summary-panel-personal')?.remove();
      document.getElementById('summary-tabs').classList.remove('has-personal-reading');
    }
  };
}
