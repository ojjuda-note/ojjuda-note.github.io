// Reconstructed from the connected Ojjuda Agit Supabase project.
window.OJJUDA_CONFIG = {
  // Kakao Developers JavaScript key. Register https://ojjuda.kr as both the
  // JavaScript SDK domain and a web link domain before enabling this feature.
  kakaoJavaScriptKey: '',
  supabaseUrl: 'https://ziezbdjofcugznowiuda.supabase.co',
  supabaseKey: "sb_publishable_iUpPUBr2HlJr9LhDRVtB0Q_toJUMazo"
};

// Shared entry point: activity is recorded only for signed-in members on the live site.
(() => {
  if (typeof document === 'undefined' || !['ojjuda.kr', 'www.ojjuda.kr'].includes(location.hostname.toLowerCase())) return;
  const activityScript = document.createElement('script');
  activityScript.src = '/shared/activity/member-navigation.js?v=20261110-account-history1';
  document.head.append(activityScript);
})();
