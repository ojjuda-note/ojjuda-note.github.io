// Arcade menus, embedded games and party rooms share one first visit per game.
(() => {
  if (window.OjjudaTutorialVisits) return;
  const groups = [['screw','screw_box','screw_flat'],['billiards','carom4','carom3','pool8']];
  const memory = new Set();
  try {
    // Same-origin game frames share the lobby fallback if browser storage is blocked.
    if (window.parent !== window && window.parent.OjjudaTutorialVisits) {
      window.OjjudaTutorialVisits = window.parent.OjjudaTutorialVisits;
      return;
    }
  } catch {}
  const prefix = 'ojjuda.arcade.practice.v1.';
  function keys(id,party) {
    const family = groups.find(group => group.includes(id)) || [id];
    const names = family.map(name => prefix + name);
    if (party) names.push('ojjuda.drinks.practice.v1.room.'+id,'ojjuda.drinks.practice.v1.local.'+id);
    if (id === 'bang') names.push('bang-tutorial-offered','bang-tutorial-complete');
    return names;
  }
  function has(id,party=false) {
    const names=keys(id,party);
    if (memory.has(names[0])) return true;
    for (const store of ['localStorage','sessionStorage']) {
      try {
        if (names.some(name => window[store].getItem(name) === '1')) {
          memory.add(names[0]);
          return true;
        }
      } catch {}
    }
    return false;
  }
  function record(id,party=false) {
    const [key]=keys(id,party);
    memory.add(key);
    for (const store of ['localStorage','sessionStorage']) {
      try {window[store].setItem(key,'1');return;} catch {}
    }
  }
  window.OjjudaTutorialVisits={has,record};
})();
