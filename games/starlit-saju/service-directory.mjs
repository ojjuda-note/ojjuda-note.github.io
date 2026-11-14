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
    form.dataset.ticketActions='true';
    doc.getElementById('form-title').textContent = '누구의 풀이인가요?';
    doc.getElementById('entry-choice-title').textContent = '다시 볼 풀이';
    form.querySelector('[data-flow-next]').dataset.flowNextLabel = '내 풀이 찾기';
  }
  return {entering, saved};
}

export function showTickets(container, {choices, state, busy, retry, select}) {
  const doc = container.ownerDocument;
  container.hidden = false;
  const stamp = JSON.stringify([choices,state,busy]);
  if (container.dataset.ticketState === stamp) return;
  container.dataset.ticketState = stamp;
  container.replaceChildren();
  function action(label, click) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = busy;
    button.addEventListener('click', click);
    container.append(button);
  }
  if (state === 'available') {
    for (const choice of choices) action(`${choice.label} 다시 보기 · 0쭈`, () => select(choice));
    return;
  }
  const message = doc.createElement('p');
  message.setAttribute('role','status');
  message.textContent = {
    pending:'풀이 내역을 확인하고 있어요…',
    error:'풀이 내역을 불러오지 못했어요.',
    login:'결제할 때 사용한 계정으로 로그인해 주세요.',
    empty:'이 출생 정보로 최근 24시간 안에 결제한 풀이가 없어요.',
  }[state];
  container.append(message);
  if (state === 'error') action('다시 확인하기', retry);
  if (state === 'login' || state === 'empty') {
    const link = doc.createElement('a');
    link.href = state === 'login' ? doc.getElementById('login-link').href : './';
    link.textContent = state === 'login' ? '아지트에서 로그인' : '풀이 목록으로';
    container.append(link);
  }
}
