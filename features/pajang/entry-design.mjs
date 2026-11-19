// Decorate only the public login gate after the existing member check has finished.
// Keep the account actions themselves so their routes and accessibility stay shared.
export function enhanceGuestGate(){
  const gate=document.getElementById('gate');
  if(!gate||gate.hidden)return false;
  const account=gate.querySelector(':scope > .ojjuda-guest-account[data-guest-account="pajang"]');
  const login=account?.querySelector('a.ojjuda-guest-account-login');
  const signup=account?.querySelector('a.ojjuda-guest-account-signup');
  const message=gate.querySelector(':scope > p');
  if(!account||!message||login?.getAttribute('href')!=='/?auth=login&next=pajang'||
    signup?.getAttribute('href')!=='/?auth=signup&next=pajang')return false;
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
  const envelope=make('div','pajang-envelope');
  const paper=make('div','pajang-invitation-paper');
  paper.append(make('span','pajang-paper-mark','파장'),make('i','pajang-paper-line'),make('i','pajang-paper-line'),make('i','pajang-paper-line'));
  envelope.append(paper,make('div','pajang-envelope-fold'),make('span','pajang-letter-seal','♥'));
  art.append(season,envelope);opening.append(copy,art);
  const footer=make('div','pajang-invitation-footer');
  message.classList.add('pajang-entry-access');
  footer.append(account,message);invitation.append(opening,footer);
  gate.replaceChildren(invitation);
  return true;
}
