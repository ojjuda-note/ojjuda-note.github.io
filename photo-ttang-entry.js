/* Entry choices for the full photo game; the guest demo keeps its one-round flow. */
(() => {
  'use strict';
  if (window.OjjudaPhotoEntryReady || typeof PUBLIC_DEMO === 'undefined' || PUBLIC_DEMO) return;
  const base = document.getElementById('photoStart');
  if (!base || typeof renderGrid !== 'function') return;
  window.OjjudaPhotoEntryReady = true;

  const row = document.createElement('div');
  row.className = 'row2';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', '사진 종류 선택');
  base.before(row);
  base.textContent = '기본';
  const shared = document.createElement('button');
  shared.id = 'photoPublicStart';
  shared.type = 'button';
  shared.className = base.className;
  shared.textContent = '공개';
  row.append(base, shared);
  const status = document.createElement('p');
  status.id = 'photoEntryStatus';
  status.className = 'ge-hint';
  status.setAttribute('role', 'status');
  status.hidden = true;
  row.after(status);
  const details = document.getElementById('grid').closest('details');
  const publicTab = document.createElement('button');
  publicTab.type = 'button';
  publicTab.className = 'tab';
  publicTab.dataset.t = 'public';
  publicTab.textContent = '공개 사진';
  document.querySelector('[data-t="base"]').after(publicTab);
  publicTab.onclick = () => { tab = 'public'; void renderGrid(); };

  function updateUploadVisibility() {
    const upload = document.getElementById('uploadBtn');
    upload.hidden = tab === 'base';
    upload.style.display = upload.hidden ? 'none' : '';
  }

  const originalGrid = renderGrid;
  renderGrid = async function () {
    if (tab !== 'public') {
      const pending = originalGrid();
      updateUploadVisibility();
      return pending;
    }
    if (!photoAllowed()) return lockPhotoGame();
    const revision = ++gridEpoch, grid = document.getElementById('grid');
    document.querySelectorAll('.tab').forEach(button => button.classList.toggle('on', button.dataset.t === tab));
    updateUploadVisibility();
    document.getElementById('cleared').textContent = '';
    LIST = [];
    grid.innerHTML = '<div class="msg">공개 사진을 불러오는 중…</div>';
    try {
      if (!await Comm.ready()) throw Error('공개 사진을 불러오지 못했어요. 다시 눌러 주세요.');
      if (revision !== gridEpoch || tab !== 'public') return;
      const {data, error} = await Comm.sb.from('photo_stages').select('*')
        .eq('visibility', 'public').eq('status', 'approved').order('created_at', {ascending:false}).limit(100);
      if (error) throw error;
      const next = await Promise.all((data || []).filter(p => p.visibility === 'public' && p.status === 'approved').map(async p => ({
        mine:p.owner === Comm.uid, vis:'public', id:p.id, key:'c' + p.id,
        img:await Comm.url(p.image_path), full:p.full_path ? await Comm.url(p.full_path) : null,
        crop:p.crop_box ? p.crop_box.split(',').map(Number) : null, sil:p.mask_rle,
        w:600, h:800, UW:30, UH:40, level:p.level, nick:p.nick, status:p.status, plays:p.plays, clears:p.clears
      })));
      if (revision !== gridEpoch || tab !== 'public') return;
      if (!photoAllowed()) return lockPhotoGame();
      LIST = next;
      if (!LIST.length) { grid.innerHTML = '<div class="msg">아직 공개된 사진이 없어요.</div>'; return; }
      grid.innerHTML = LIST.map((photo, i) => {
        const done = photoDone(photo);
        return `<button class="cell${done ? ' done' : ''}" data-i="${i}"><img src="${esc(photo.full || photo.img)}" alt="${done ? '공개된 사진' : '클리어하면 공개되는 사진'}"${done ? '' : ' class="blurred"'} loading="lazy">${done ? '' : '<span class="unlock-note">클리어하면 공개</span>'}<b>${esc(photo.nick || '공개 사진')}</b><em>${'★'.repeat(diff(photo.level).stars)}</em></button>`;
      }).join('');
      document.getElementById('cleared').textContent = `${LIST.filter(photoDone).length} / ${LIST.length} 공개`;
      grid.querySelectorAll('.cell').forEach(button => { button.onclick = () => { lives = LIVES; startStage(Number(button.dataset.i)); }; });
    } catch {
      if (revision === gridEpoch && tab === 'public') grid.innerHTML = '<div class="msg">공개 사진을 불러오지 못했어요. 다시 눌러 주세요.</div>';
    }
  };
  updateUploadVisibility();

  let loading = false;
  async function enter(kind) {
    if (loading) return;
    if (!photoAllowed()) return lockPhotoGame();
    loading = true;
    base.disabled = shared.disabled = true;
    status.hidden = false;
    status.textContent = kind === 'public' ? '공개 사진을 불러오는 중…' : '기본 사진을 준비하는 중…';
    try {
      tab = kind;
      const pending = renderGrid(), revision = gridEpoch;
      details.open = true;
      details.scrollIntoView?.({block:'start'});
      await pending;
      if (revision !== gridEpoch || tab !== kind || mode !== 'menu' || !photoAllowed()) return;
      const grid = document.getElementById('grid');
      status.textContent = grid.querySelector('.cell:not([disabled])') ? '사진을 골라 주세요.' : grid.textContent.trim();
    } finally {
      loading = false;
      base.disabled = shared.disabled = false;
      if (tab !== kind || mode !== 'menu') status.hidden = true;
    }
  }
  base.onclick = () => enter('base');
  shared.onclick = () => enter('public');
})();
