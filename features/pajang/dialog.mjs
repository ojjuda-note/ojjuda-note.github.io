import {call, client} from './member.mjs?v=3';
let checking = false;
export async function openPajang(launch) {
  if (checking || document.querySelector('dialog.agit-pajang-dialog[open]')) return;
  checking = true;
  launch.setAttribute('aria-busy', 'true');
  try {
    const db = await client();
    const {data} = await db.auth.getSession();
    if (data.session && !data.session.user.is_anonymous && (await call('entry')).body) {
      window.location.assign('/features/pajang/station.html');
      return;
    }
  } catch {
    // The embedded entry can retry the check and display the site's sign-in or error screen.
  } finally {
    checking = false;
    launch.removeAttribute('aria-busy');
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'agit-pajang-dialog';
  dialog.setAttribute('aria-labelledby','pajang-dialog-heading');
  const bar = document.createElement('div');
  bar.className = 'agit-pajang-toolbar';
  const heading = document.createElement('strong');
  heading.id = 'pajang-dialog-heading';
  heading.textContent = '파장 · 소개팅 레이더';
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label','팝업 닫기');
  close.textContent = '×';
  close.addEventListener('click',()=>dialog.close());
  bar.append(heading, close);
  const frame = document.createElement('iframe');
  frame.title = '파장 회원 전용 소개팅';
  frame.src = '/features/pajang/?embed=1&v=rounds1';
  frame.allow = "accelerometer 'self'; gyroscope 'self'; magnetometer 'self'";
  dialog.append(bar, frame);
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  function dismiss(){dialog.close();}
  function escapeFrame(event){
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data === 'pajang:close') dismiss();
  }
  window.addEventListener('message', escapeFrame);
  window.addEventListener('popstate', dismiss);
  const priorOverflow = document.body.style.overflow;
  dialog.addEventListener('close', () => {
    window.removeEventListener('message', escapeFrame);
    window.removeEventListener('popstate', dismiss);
    document.body.style.overflow = priorOverflow;
    dialog.remove();
    const trigger = launch.isConnected ? launch : document.querySelector('[data-pajang-launch]');
    trigger?.focus({preventScroll:true});
  }, {once:true});
  dialog.showModal();
  document.body.style.overflow='hidden';
  close.focus({preventScroll:true});
}
