// Decorate only the public login gate after the existing member check has finished.
// Keep the account actions themselves so their routes and accessibility stay shared.
export function enhanceGuestGate(){
  const gate=document.getElementById('gate');
  if(!gate||gate.hidden)return false;
  const account=gate.querySelector(':scope > .ojjuda-guest-account[data-guest-account="pajang"]');
  const login=account?.querySelector('a.ojjuda-guest-account-login');
  const signup=account?.querySelector('a.ojjuda-guest-account-signup');
  const message=gate.querySelector(':scope > p');
  const accountRoute=(link,mode)=>{
    if(!link)return false;
    const url=new URL(link.href,location.href),keys=[...url.searchParams.keys()];
    return url.origin===location.origin&&url.pathname==='/'&&url.searchParams.get('auth')===mode&&
      url.searchParams.get('next')==='pajang'&&keys.every(key=>['auth','next','ref'].includes(key))&&
      keys.length===new Set(keys).size;
  };
  if(!account||!message||!accountRoute(login,'login')||!accountRoute(signup,'signup'))return false;
  const make=(tag,className,text)=>{
    const node=document.createElement(tag);node.className=className;
    if(text)node.textContent=text;
    return node;
  };
  const invitation=make('section','pajang-invitation');
  invitation.setAttribute('aria-labelledby','pajang-entry-title');
  const opening=make('div','pajang-invitation-opening');
  const copy=make('div','pajang-invitation-copy');
  const eyebrow=make('span','pajang-entry-eyebrow','취향으로 만나는 소개팅');
  const title=make('h1','pajang-entry-title');title.id='pajang-entry-title';
  title.append(document.createTextNode('마음이 닿는'),document.createElement('br'),make('span','','오늘의 한마디.'));
  copy.append(eyebrow,title,make('p','pajang-entry-lead','답변으로 시작하는 새로운 인연.'));
  const art=make('div','pajang-invitation-art');art.setAttribute('aria-hidden','true');
  const season=make('div','pajang-invitation-season');
  const water=make('div','pajang-invitation-water');
  const ripples=make('div','pajang-water-ripples');
  for(let i=0;i<4;i++)ripples.append(make('i','pajang-water-ring'));
  water.append(ripples);
  const envelope=make('div','pajang-envelope');
  const paper=make('div','pajang-invitation-paper');
  paper.append(make('span','pajang-paper-mark','파장'),make('i','pajang-paper-line'),make('i','pajang-paper-line'),make('i','pajang-paper-line'));
  envelope.append(paper,make('div','pajang-envelope-fold'),make('span','pajang-letter-seal','♥'));
  const reflection=envelope.cloneNode(true);reflection.className='pajang-letter-reflection';
  art.append(season,water,reflection,envelope);opening.append(copy,art);
  const footer=make('div','pajang-invitation-footer');
  message.classList.add('pajang-entry-access');
  const settings=make('section','ojjuda-settings pajang-public-settings');
  settings.setAttribute('aria-label','파장 설정');
  const list=make('div','ojjuda-settings-list');
  const detail=label=>{
    const menu=make('details','ojjuda-settings-details');
    const summary=make('summary','ojjuda-settings-row');
    const arrow=make('span','ojjuda-settings-arrow','›');arrow.setAttribute('aria-hidden','true');
    summary.append(make('span','ojjuda-settings-label',label),arrow);
    const body=make('div','ojjuda-settings-body');menu.append(summary,body);
    return {menu,body};
  };
  const settingsMenu=detail('설정'),helpMenu=detail('도움말');
  const organization=make('a','ojjuda-settings-row');
  organization.href='/features/organization/?from=pajang';organization.target='_top';
  const arrow=make('span','ojjuda-settings-arrow','›');arrow.setAttribute('aria-hidden','true');
  organization.append(make('span','ojjuda-settings-label','조직도'),arrow);
  const serviceBanners=make('ojjuda-service-banners','');
  serviceBanners.setAttribute('current','pajang');
  helpMenu.body.append(organization);settingsMenu.body.append(helpMenu.menu,serviceBanners);
  if(new URLSearchParams(location.search).get('tab')==='profile')settingsMenu.menu.open=true;
  list.append(settingsMenu.menu);settings.append(list);
  footer.append(account,message,settings);invitation.append(opening,footer);
  gate.replaceChildren(invitation);
  return true;
}
