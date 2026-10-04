/* World navigation around the complete existing card application. */
(() => {
  'use strict';
  const hosted=parent!==window;
  const exitTo = href => { if(hosted) parent.location.assign(href); else location.assign(href); };
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin)return;
    if(link.matches('.brand')){event.preventDefault();document.querySelector('[data-show="feed"]')?.click();return;}
    if(url.pathname==='/world.html'||url.pathname==='/'||url.pathname==='/guide.html'){
      if(window.canCloseParkNote?.()===false){event.preventDefault();return;}
      event.preventDefault();exitTo(url.pathname+url.search+url.hash);
    }
  });
  window.OjjudaParkFull={back(){
    if(!backdrop.hidden){if(window.canCloseParkNote?.()!==false)closeComposer();return true;}
    if(document.body.classList.contains('note-my-open')){document.querySelector('[data-show="feed"]')?.click();return true;}
    if(!detail.hidden){goBack();return true;}
    return false;
  }};
})();
