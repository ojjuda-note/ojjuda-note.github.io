// Read the catalog choice from the URL so opening a link in a new tab and Back both work.
export function openCatalogChoice(doc) {
  const catalog = doc.getElementById('saju-catalog');
  const form = doc.getElementById('birth-form');
  const topic = new URL(doc.defaultView.location.href).searchParams.get('reading');
  const radio = [...form.querySelectorAll('[name="entry-topic"]')].find(input => input.value === topic);
  const saved = topic === 'saved';
  const entering = Boolean(radio || saved);
  catalog.hidden = entering;
  doc.getElementById('intro').hidden = !entering;
  doc.body.dataset.entryView = entering ? 'form' : 'catalog';
  const skip = doc.querySelector('.skip-link');
  skip.href = entering ? '#form-title' : '#catalog-title';
  skip.textContent = entering ? '출생 정보 입력으로 바로가기' : '풀이 목록으로 바로가기';
  doc.querySelector('.saved-reading-nav').hidden = !saved;
  if (radio) radio.checked = true;
  form.querySelector('.saved-people-disclosure').open = saved;
  if (saved) {
    doc.getElementById('form-title').textContent = '누구의 풀이인가요?';
    doc.getElementById('entry-choice-title').textContent = '다시 볼 풀이';
    form.querySelector('[data-flow-next]').dataset.flowNextLabel = '이용권 확인';
  }
  return {entering, saved};
}

export function showTickets(container, {choices, current, pending, error, signedIn, busy, select}) {
  const doc = container.ownerDocument;
  container.hidden = false;
  // Keep focused buttons intact across a wallet refresh when the offers did not change.
  const state = JSON.stringify([choices, current, pending, error, signedIn, busy]);
  if (container.dataset.ticketState === state) return;
  container.dataset.ticketState = state;
  container.replaceChildren();
  if (!choices.length) {
    const message = doc.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = error ? '이용권을 확인하지 못했어요.' : !signedIn ? '로그인하면 이 생일로 본 풀이를 확인할 수 있어요.'
      : pending ? '이용권을 확인하고 있어요.' : '이 생일로 지금 다시 볼 수 있는 풀이가 없어요.';
    container.append(message);
    const catalog = doc.createElement('a');
    catalog.href = './';
    catalog.textContent = '풀이 목록으로';
    container.append(catalog);
    return;
  }
  for (const choice of choices) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = choice.label;
    button.setAttribute('aria-pressed', String(choice.topic === current.topic && choice.year === current.year));
    button.disabled = busy;
    button.addEventListener('click', () => select(choice));
    container.append(button);
  }
}
