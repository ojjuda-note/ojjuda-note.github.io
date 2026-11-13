import {SajuSavedProfileError} from './saved-profiles.mjs?v=20261113-saju-reader1';

// Pickers sharing the same store refresh each other's lists after an explicit
// save/delete. Selecting a person only calls fill; this module has no billing.
const pickers=new WeakMap();
const genderLabel=gender=>gender==='male'?'남성':gender==='female'?'여성':'성별 미선택';
const pad=value=>String(value).padStart(2,'0');
function dateLabel(birth) {
  return (birth.calendar==='lunar'?'음력 ':'양력 ')+birth.year+'. '+pad(birth.month)+'. '+pad(birth.day)+'.'+(birth.leapMonth?' (윤달)':'');
}
function timeLabel(birth) {
  return birth.hour===null?'시간 모름':pad(birth.hour)+':'+pad(birth.minute);
}
function messageOf(error) {
  return typeof error?.message==='string'&&error.message.trim()
    ? error.message.slice(0,400)
    : '정보를 저장하지 못했어요. 입력 내용을 확인한 뒤 다시 시도해 주세요.';
}

export class SajuProfilePicker {
  constructor({element,store,read,fill,clear,title='저장한 사람'}={}) {
    if(!element?.ownerDocument||typeof element.replaceChildren!=='function'
      || !store||['ownerId','list','get','save','remove'].some(key=>typeof store[key]!=='function')
      || [read,fill,clear].some(callback=>typeof callback!=='function'))throw new SajuSavedProfileError('invalid');
    this.element=element;
    this.store=store;
    this.read=read;
    this.fill=fill;
    this.clear=clear;
    this._owner=null;
    this._selectedId=null;
    this._revision=0;
    this._disabled=false;
    this._pending=false;
    this._destroyed=false;
    const doc=element.ownerDocument;
    const node=(tag,classes,text)=>{
      const value=doc.createElement(tag);
      value.className=classes;
      if(text!==undefined)value.textContent=text;
      return value;
    };
    this._node=node;
    const heading=node('h3','profile-picker-title',title);
    const note=node('p','profile-picker-note','이 기기에 저장');
    this.listElement=node('ul','profile-picker-list');
    this.listElement.setAttribute('aria-label','저장한 출생 정보');
    const actions=node('div','profile-picker-actions');
    this.saveButton=node('button','profile-picker-save','이 정보 저장');
    this.newButton=node('button','profile-picker-new','새 사람 입력');
    this.saveButton.type=this.newButton.type='button';
    actions.append(this.saveButton,this.newButton);
    this.statusElement=node('p','profile-picker-status');
    this.statusElement.setAttribute('role','status');
    this.statusElement.setAttribute('aria-live','polite');
    this.statusElement.setAttribute('aria-atomic','true');
    element.classList.add('profile-picker');
    element.replaceChildren(heading,note,this.listElement,actions,this.statusElement);
    this.saveButton.addEventListener('click',()=>{void this.saveCurrent();});
    this.newButton.addEventListener('click',()=>{
      if(this._disabled||this._pending)return;
      this.resetSelection();
      try {this.clear();} catch(error) {this._status(messageOf(error),'error');}
    });
    if(!pickers.has(store))pickers.set(store,new Set());
    pickers.get(store).add(this);
    this.refresh();
  }

  get selectedId() {return this._selectedId;}

  _status(message='',kind='info') {
    this.statusElement.textContent=message;
    this.statusElement.dataset.state=kind;
    this.statusElement.setAttribute('role',kind==='error'?'alert':'status');
    this.statusElement.setAttribute('aria-live',kind==='error'?'assertive':'polite');
  }

  _buttons() {
    const disabled=this._disabled||this._pending||this._destroyed;
    for(const button of this.element.querySelectorAll('button'))button.disabled=disabled;
    this.saveButton.disabled=disabled||this._owner===null;
    this.saveButton.textContent=this._pending?'저장 중…':this._selectedId?'수정한 정보 저장':'이 정보 저장';
  }

  _selection() {
    for(const item of this.listElement.children) {
      const selected=item.dataset.profileId===this._selectedId;
      item.classList.toggle('is-selected',selected);
      item.querySelector('.profile-picker-use')?.setAttribute('aria-pressed',String(selected));
    }
    this._buttons();
  }

  _refreshPeers() {
    let owner=null;
    try {owner=this.store.ownerId();} catch {}
    for(const picker of pickers.get(this.store)||[]) {
      if(picker!==this&&!picker._destroyed) {
        const preserveStatus=owner!==null&&picker._owner===owner&&picker.statusElement.dataset.state==='error';
        picker.refresh({preserveStatus});
      }
    }
  }

  refresh({preserveStatus=false}={}) {
    if(this._destroyed)return [];
    this.listElement.replaceChildren();
    if(!preserveStatus)this._status();
    let owner=null;
    try {
      owner=this.store.ownerId();
      if(this._owner!==owner) {
        this._owner=owner;
        this._selectedId=null;
        this._revision++;
      }
      const profiles=this.store.list();
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      if(this._selectedId&&!profiles.some(profile=>profile.id===this._selectedId)) {
        this._selectedId=null;
        this._revision++;
      }
      for(const profile of profiles) {
        const item=this._node('li','profile-picker-item');
        item.dataset.profileId=profile.id;
        const use=this._node('button','profile-picker-use');
        use.type='button';
        const label=profile.name||dateLabel(profile.birth);
        use.append(this._node('span','profile-picker-name',label));
        const parts=[genderLabel(profile.gender)];
        if(profile.name)parts.push(dateLabel(profile.birth));
        parts.push(timeLabel(profile.birth));
        use.append(this._node('span','profile-picker-meta',parts.join(' · ')));
        use.addEventListener('click',()=>this._use(profile.id,owner));
        const remove=this._node('button','profile-picker-delete','삭제');
        remove.type='button';
        remove.setAttribute('aria-label',label+' 저장 정보 삭제');
        remove.addEventListener('click',()=>this._remove(profile.id,owner));
        item.append(use,remove);
        this.listElement.append(item);
      }
      if(!profiles.length&&!preserveStatus)this._status('저장한 정보가 아직 없어요.');
      this._selection();
      return profiles;
    } catch(error) {
      this.listElement.replaceChildren();
      this._selectedId=null;
      this._revision++;
      try {this._owner=this.store.ownerId();} catch {this._owner=null;}
      this._status(messageOf(error),error?.code==='not_signed_in'?'info':'error');
      this._buttons();
      return [];
    }
  }

  _use(id,owner) {
    if(this._disabled||this._pending||this._destroyed)return;
    try {
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      const profile=this.store.get(id);
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      this.fill(profile);
      this._selectedId=id;
      this._revision++;
      this._selection();
      this._status('저장한 정보를 입력했어요.');
    } catch(error) {
      this.refresh({preserveStatus:true});
      this._status(messageOf(error),'error');
    }
  }

  _remove(id,owner) {
    if(this._disabled||this._pending||this._destroyed)return;
    try {
      this.store.remove(id,{expectedOwner:owner});
      if(this._selectedId===id)this.resetSelection();
      this.refresh({preserveStatus:true});
      this._status('저장한 정보를 삭제했어요.');
      this._refreshPeers();
    } catch(error) {
      this.refresh({preserveStatus:true});
      this._status(messageOf(error),'error');
    }
  }

  async saveCurrent() {
    if(this._destroyed)return null;
    if(this._pending) {
      this._status(new SajuSavedProfileError('busy').message,'info');
      return null;
    }
    this._pending=true;
    this._buttons();
    try {
      const owner=this.store.ownerId(),revision=this._revision,id=this._selectedId;
      if(this._owner!==owner)throw new SajuSavedProfileError('account_changed');
      const value=await this.read();
      if(this._destroyed||revision!==this._revision)throw new SajuSavedProfileError('changed');
      const profile=this.store.save(value,{id,expectedOwner:owner});
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      this._selectedId=profile.id;
      this.refresh({preserveStatus:true});
      this._status('이 기기에 저장했어요.','success');
      this._refreshPeers();
      return profile;
    } catch(error) {
      if(!this._destroyed) {
        this.refresh({preserveStatus:true});
        this._status(messageOf(error),'error');
      }
      return null;
    } finally {
      this._pending=false;
      if(!this._destroyed)this._buttons();
    }
  }

  setDisabled(disabled) {
    this._disabled=Boolean(disabled);
    this._buttons();
  }

  resetSelection() {
    this._selectedId=null;
    this._revision++;
    this._selection();
    this._status();
  }

  destroy() {
    this._destroyed=true;
    this._revision++;
    pickers.get(this.store)?.delete(this);
    this.element.replaceChildren();
  }
}
