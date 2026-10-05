/* Compatibility for cached Park pages: World owns the single service notice. */
(() => {
  const announcement = document.getElementById('note-announcement');
  if (!announcement) return;
  announcement.hidden = true;
  announcement.style.setProperty('display', 'none', 'important');
})();
