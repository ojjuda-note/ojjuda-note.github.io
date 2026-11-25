'use strict';
window.OJJUDA_CONFIG={};
let opening;
window.OjjudaGetClient = () => opening ||= (async () => {
  const res=await fetch('https://ojjuda.kr/park/even-public.json',{credentials:'omit'});
  if (!res.ok) throw Error('공원 연결을 확인해 주세요.');
  const settings=await res.json();
  if (settings.supabaseUrl!=='https://ziezbdjofcugznowiuda.supabase.co' ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(settings.supabaseKey)) throw Error('공원 설정을 확인해 주세요.');
  Object.assign(window.OJJUDA_CONFIG,settings);
  return window.supabase.createClient(settings.supabaseUrl,settings.supabaseKey,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
})().catch(error=>{opening=null;throw error;});
