/* World background music removed. Keep this no-audio shim for cached pages. */
(() => {
  'use strict';
  // Also turn off the old player in other already-open same-origin tabs.
  try { localStorage.setItem('ojjuda.world.bgm.enabled.v1', 'off'); } catch {}
  try { window.OjjudaWorldBgm?.setEnabled(false); } catch {}

  function removeWorldBgm() {
    const audio = document.getElementById('world-bgm-audio');
    if (audio) {
      try { audio.pause(); } catch {}
      audio.removeAttribute('src');
      audio.querySelectorAll('source').forEach(source => source.remove());
      try { audio.load(); } catch {}
      audio.remove();
    }
    document.getElementById('world-bgm-toggle')?.remove();
  }

  // Compatibility only: never create a player, button, or playback listeners.
  // Game effects and foreground video/audio are deliberately left untouched.
  window.OjjudaWorldBgm = {
    setEnabled() {},
    hold() { return () => {}; },
    status() {
      return {enabled:false, playing:false, position:0, loop:false,
        volume:0, blockedBy:['removed'], error:false};
    }
  };
  removeWorldBgm();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeWorldBgm, {once:true});
  }
})();
