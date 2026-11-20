import { listPersonalContexts } from './personal-contexts.js?v=20261114-tarot-first-person1';
import { buildPersonalReading, personalReadingCopyLines } from './personal-reading.js?v=20261120-tarot-voice2';

// This view only reinterprets the three already revealed cards. It does not
// start a purchase, draw a card, change a receipt, or extend its expiry.
export function createPersonalReading({ getSnapshot, canRead, onReport }) {
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let topicId = null;
  let selectedId = '';
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

  function renderReport(changed = false) {
    if (!readable()) return false;
    report = selectedId ? buildPersonalReading({ cards: currentCards, topicId, contextId: selectedId }) : null;
    const picker = element('div', 'personal-context-picker personal-result-picker');
    const label = element('label', '', '지금 내 상황');
    label.htmlFor = 'result-context-select';
    const select = element('select');
    select.id = 'result-context-select';
    fillOptions(select);
    select.addEventListener('change', () => {
      if (!readable()) return;
      choose(select.value);
      renderReport(true);
    });
    picker.append(label, select);
    return onReport?.({ report, picker, selectedId, changed }) !== false;
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
      return renderReport();
    },
    copyLines() {
      return readable() ? personalReadingCopyLines(report) : [];
    },
    reset() {
      selectedId = '';
      report = null;
      currentCards = [];
      introSelect.value = '';
    }
  };
}
