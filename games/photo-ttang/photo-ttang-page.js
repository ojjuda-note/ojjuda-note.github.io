/* One unrestricted guest round; full play uses the same 19+ member gate as Matgo. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const trialKey = 'ojjuda-photo-ttang-demo-v1';
  const gameUrl = '/games/photo-ttang.html?v=20261113-game-popup-order1';
  const access = window.OjjudaPhotoTtangAccess;
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
// unchanged production source at line 7
