// Reconstructed from the connected Ojjuda Agit Supabase project.
window.OJJUDA_CONFIG = {
  // Kakao Developers JavaScript key. Register https://ojjuda.kr as both the
  // JavaScript SDK domain and a web link domain before enabling this feature.
  kakaoJavaScriptKey: '',
  supabaseUrl: 'https://ziezbdjofcugznowiuda.supabase.co',
  supabaseKey: "sb_publishable_iUpPUBr2HlJr9LhDRVtB0Q_toJUMazo"
};

// Standalone tools and member history share one auth client, including during SDK loading.
(() => {
  if (window.OjjudaGetClient) return;
  let pending;
  window.OjjudaGetClient = () => {
    if (window.ojjudaSupabase?.auth) return Promise.resolve(window.ojjudaSupabase);
    if (pending) return pending;
    pending = (async () => {
      if (!window.supabase?.createClient) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('auth_sdk_unavailable')); };
        const timer = setTimeout(fail, 15000);
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = fail;
        document.head.append(script);
      });
      if (!window.ojjudaSupabase?.auth) {
        const config = window.OJJUDA_CONFIG;
        window.ojjudaSupabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
      }
      return window.ojjudaSupabase;
    })().catch(error => { pending = null; throw error; });
    return pending;
  };
})();

// Shared entry point: activity is recorded only for signed-in members on the live site.
(() => {
  if (typeof document === 'undefined' || !['ojjuda.kr', 'www.ojjuda.kr'].includes(location.hostname.toLowerCase())) return;
  const activityScript = document.createElement('script');
  activityScript.src = '/shared/activity/member-navigation.js?v=20261113-biorhythm-paid1';
  document.head.append(activityScript);
})();
