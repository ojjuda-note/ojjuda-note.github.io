const assert = require('node:assert/strict');

function visible(element) {
  if (!element || element.closest('[hidden]')) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DIALOG' && !parent.open) return false;
    if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
  }
  return true;
}

function storySelect(root) {
  return root.matches?.('select') ? root : root.querySelector('#reading-page-select,#compatibility-page-select');
}

function currentStory(root) {
  const reader = root.matches?.('.story-reader') ? root : root.querySelector('.story-reader');
  assert.ok(reader, 'a purchased reading has a story reader');
  const scenes = [...reader.querySelectorAll('.story-stage > article.story-scene')];
  assert.equal(scenes.length, 1, 'only the current story article is mounted');
  const scene = scenes[0];
  assert.ok(visible(scene), 'the current story is directly readable');
  assert.equal(scene.querySelectorAll('.story-title').length, 1, 'a story has one main title');
  assert.ok(scene.querySelector('.story-title').textContent.trim());
  assert.ok(scene.querySelectorAll('.story-body > p').length <= 2, 'a story exposes at most two short paragraphs');
  assert.equal(scene.querySelector('.reading-map,.reading-item-picker,.reader-card,details.reading-story-details'), null,
    'the selected story does not bring back the nested report or prose disclosures');
  const markers = [...reader.querySelectorAll('[data-reader-current],[data-compatibility-current]')];
  assert.deepEqual(markers, [scene], 'one active scene owns the reader marker');
  assert.equal(storySelect(reader).value, scene.id, 'the selected value identifies the actual current scene');
  return scene;
}

function chooseStory(select, id) {
  assert.ok(select, 'the purchased reader retains its selection state');
  const doc = select.ownerDocument, reader = select.closest('.story-reader');
  const toggle = doc.getElementById(select.id + '-toggle');
  assert.ok(toggle && visible(toggle), 'the contents has a visible opening button');
  const menu = reader.querySelector('dialog.story-menu');
  assert.ok(menu, 'the complete contents lives in a dialog');
  if (!menu.open) toggle.click();
  assert.equal(menu.open, true, 'the reader explicitly opens the contents');
  const options = [...select.options], target = options.findIndex(option => option.value === id);
  assert.ok(target >= 0, `${id} is a purchased scene`);
  const choices = new Map([...menu.querySelectorAll('[data-reading-target]')].map(item => [item.dataset.readingTarget, item]));
  let first = target;
  while (first >= 0 && !choices.has(options[first].value)) first--;
  const button = choices.get(options[first]?.value);
  assert.ok(button, `${id} is reachable from its topic in the contents`);
  const domain = menu.querySelector(`.reading-domain-button[data-reading-domain="${button.dataset.readingDomain}"]`);
  assert.ok(domain, 'the topic belongs to an available reading field');
  if (domain.getAttribute('aria-pressed') !== 'true') domain.click();
  if (button.dataset.readingPeriod && !visible(button)) {
    const period = [...menu.querySelectorAll('select.story-period-select')].find(control => visible(control)
      && [...control.options].some(option => option.value === button.dataset.readingPeriod));
    assert.ok(period, 'the requested month or decade can be chosen explicitly');
    period.value = button.dataset.readingPeriod;
    period.dispatchEvent(new doc.defaultView.Event('change', {bubbles: true}));
  }
  assert.ok(visible(button), 'the requested contents item is visible in the open dialog');
  button.click();
  assert.equal(menu.open, false, 'choosing a reading closes the contents');
  const next = reader.querySelectorAll('.reading-pager-step')[1];
  for (let position = first; position < target; position++) {
    assert.equal(next.disabled, false, 'the selected topic can reach the requested paragraph');
    next.click();
  }
  assert.equal(select.value, id, 'the contents and selected scene agree');
  return currentStory(reader);
}

function followStory(root, id) {
  const doc = root.ownerDocument, link = doc.createElement('a');
  link.href = '#' + id;
  link.textContent = '풀이로 이동';
  link.addEventListener('click', event => event.preventDefault(), {once: true});
  doc.body.append(link);
  link.click();
  link.remove();
  return currentStory(root);
}

function namedMeter(meter) {
  return meter.getAttribute('aria-label') || (meter.getAttribute('aria-labelledby') || '').split(/\s+/)
    .map(id => meter.ownerDocument.getElementById(id)?.textContent || '').join(' ');
}

function snapshotStory(root) {
  const scene = currentStory(root);
  const summaries = [...scene.querySelectorAll('[data-story-summary-index]')]
    .map(item => ({index: Number(item.dataset.storySummaryIndex), text: item.textContent}));
  const paragraphs = [...scene.querySelectorAll('.story-body > p')].map(item => ({
    text: item.textContent, key: item.dataset.storyParagraph || null,
    start: item.hasAttribute('data-story-start') ? Number(item.dataset.storyStart) : null,
    end: item.hasAttribute('data-story-end') ? Number(item.dataset.storyEnd) : null,
  }));
  const scores = [...scene.querySelectorAll('.saju-reading-score')].map(panel => ({
    status: panel.dataset.readingScoreStatus,
    reason: panel.querySelector('.saju-reading-score-reason')?.textContent || '',
    text: panel.textContent,
    meters: [...panel.querySelectorAll('.saju-wind-meter[role="meter"]')].map(meter => ({
      wind: meter.closest('[data-wind]')?.dataset.wind,
      value: Number(meter.getAttribute('aria-valuenow')),
      min: meter.getAttribute('aria-valuemin'), max: meter.getAttribute('aria-valuemax'),
      width: meter.querySelector('.saju-wind-fill')?.style.width, name: namedMeter(meter),
      text: meter.closest('[data-wind]')?.textContent || '',
    })),
  }));
  return {id: scene.id, source: scene.dataset.storySource, topic: scene.dataset.storyTopic,
    kind: scene.dataset.storyKind, data: {...scene.dataset}, title: scene.querySelector('.story-title').textContent,
    label: scene.querySelector('.story-label')?.textContent || '', text: scene.textContent,
    summaries, paragraphs, scores};
}

function collectStories(root, {restore = true} = {}) {
  const select = storySelect(root), saved = select.value, ids = [...select.options].map(option => option.value);
  assert.ok(ids.length > 0, 'the paid reading provides scenes');
  assert.equal(new Set(ids).size, ids.length, 'scene identifiers are unique');
  if (select.value !== ids[0]) chooseStory(select, ids[0]);
  const reader = select.closest('.story-reader'), scenes = [], buttons = [...reader.querySelectorAll('.reading-pager-step')];
  assert.equal(buttons.length, 2, 'the reader exposes one previous and one next control');
  const [previous, next] = buttons;
  assert.equal(previous.disabled, true, 'the first scene does not wrap backwards');
  for (const [index, id] of ids.entries()) {
    assert.equal(select.value, id, 'next follows the complete displayed reading order');
    const scene = snapshotStory(reader);
    scenes.push(scene);
    assert.equal(next.disabled, index === ids.length - 1, 'only the final scene disables next');
    if (!next.disabled) next.click();
  }
  assert.equal(scenes.length, ids.length, 'every scene is reachable through the normal next control');
  const final = select.value;next.click();assert.equal(select.value, final, 'the final scene does not wrap');
  if (restore && select.value !== saved) chooseStory(select, saved);
  return scenes;
}

function collectCurrentTopic(root, {restore = true} = {}) {
  const select = storySelect(root), saved = select.value, topic = currentStory(root).dataset.storyTopic, scenes = [];
  const next = select.closest('.story-reader').querySelectorAll('.reading-pager-step')[1];
  for (;;) {
    const scene = snapshotStory(root);
    if (scene.topic !== topic) break;
    scenes.push(scene);
    if (next.disabled) break;
    next.click();
  }
  if (restore && select.value !== saved) chooseStory(select, saved);
  return scenes;
}

function originalParagraphs(scenes, {kind = 'prose'} = {}) {
  const paragraphs = new Map();
  for (const scene of scenes.filter(scene => scene.kind === kind)) for (const part of scene.paragraphs) {
    if (!part.key) continue;
    let paragraph = paragraphs.get(part.key);
    if (!paragraph) { paragraph = {text: '', end: 0}; paragraphs.set(part.key, paragraph); }
    assert.equal(part.start, paragraph.end, `${part.key}: consecutive scenes retain every original character`);
    assert.equal(part.end - part.start, part.text.length, `${part.key}: offsets describe the displayed text`);
    paragraph.text += part.text;paragraph.end = part.end;
  }
  return [...paragraphs.values()].map(paragraph => paragraph.text);
}

function assertOriginalParagraphs(scenes, expected, label = 'the reading') {
  assert.ok(scenes.length, `${label} remains reachable`);
  assert.deepEqual(originalParagraphs(scenes), expected, `${label} preserves every complete paragraph in its authored order`);
}

function groupStories(scenes) {
  const groups = new Map();
  for (const scene of scenes) {
    if (!groups.has(scene.topic)) groups.set(scene.topic, []);
    groups.get(scene.topic).push(scene);
  }
  return [...groups.values()];
}

function storySummary(scenes) {
  const lines = new Map();
  for (const line of scenes.flatMap(scene => scene.summaries)) lines.set(line.index, (lines.get(line.index) || '') + line.text);
  return [...lines.values()];
}

function storiesForItem(scenes, item, {used = new Set()} = {}) {
  const groups = groupStories(scenes).filter(group => !used.has(group[0].topic));
  const matches = group => JSON.stringify(storySummary(group)) === JSON.stringify(item.summaryLines);
  const exact = item.id && groups.find(group => group.some(scene => scene.source === item.id || scene.topic === item.id
    || ['readerCard','portraitCard','daeunTopic','readingSupplement'].some(key => scene.data[key] === item.id)) && matches(group));
  const full = item.paragraphs && groups.find(group => matches(group) && group.some(scene => scene.kind === 'prose' && scene.paragraphs.some(part => part.key)));
  const found = exact || full || groups.find(matches);
  assert.ok(found, `${item.id || item.title || item.label || item.headline}: the calculated interpretation remains reachable`);
  used.add(found[0].topic);
  return found;
}

function assertSummaryAndScore(scenes, expected, label = 'the reading') {
  assert.ok(scenes.length, `${label} remains reachable`);
  const summaries = new Map();
  for (const line of scenes.flatMap(scene => scene.summaries)) summaries.set(line.index, (summaries.get(line.index) || '') + line.text);
  assert.deepEqual([...summaries.keys()], [0, 1], `${label} has both summary units in order`);
  assert.deepEqual([...summaries.values()], expected.summaryLines, `${label} keeps its calculated summaries`);
  if (!expected.readingScore) return;
  const score = expected.readingScore, panels = scenes.flatMap(scene => scene.scores);
  assert.equal(panels.length, 1, `${label} has one score panel in its normal reading sequence`);
  const panel = panels[0];
  assert.equal(scenes[0].scores.length, 1, `${label} shows its score beside the initial summary`);
  assert.equal(panel.status, score.status);
  if (!score.available) {
    assert.equal(panel.meters.length, 0, 'unsupported scores do not invent zero bars');
    assert.equal(panel.reason, score.reason);return;
  }
  assert.equal(panel.meters.length, 2, 'both independent values remain visible');
  assert.deepEqual(panel.meters.map(meter => meter.wind), ['tailwind', 'headwind']);
  for (const meter of panel.meters) {
    const value = score[meter.wind];
    assert.equal(meter.value, value.value);assert.equal(meter.width, `${value.value}%`);
    assert.equal(meter.min, '0');assert.equal(meter.max, '100');
    assert.ok(meter.name.includes(value.label), 'each meter retains its accessible direction');
    assert.ok(meter.text.includes(`${value.value}점`) && meter.text.includes(value.label), 'values are readable without color');
  }
}

module.exports = {visible, storySelect, currentStory, chooseStory, followStory, namedMeter,
  snapshotStory, collectStories, originalParagraphs, assertOriginalParagraphs, assertSummaryAndScore,
  groupStories, storySummary, storiesForItem, collectCurrentTopic};
