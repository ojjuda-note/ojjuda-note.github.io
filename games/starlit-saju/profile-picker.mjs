import {SajuSavedProfileError} from './saved-profiles.mjs?v=20261113-saju-reader1';

// Pickers share device-local lists. Automatic saves follow real input events;
// choosing a person or refreshing a list never starts a purchase or a new save.
const pickers=new WeakMap();
let zodiacModulePromise;
function zodiacModule() {
  zodiacModulePromise ||= import('./zodiac.mjs?v=20261113-saju-zodiac1').catch(error=>{zodiacModulePromise=null;throw error;});
  return zodiacModulePromise;
}
const genderLabel=gender=>gender==='male'?'남성':gender==='female'?'여성':'성별 미선택';
const pad=value=>String(value).padStart(2,'0');
const profileStamp=profile=>JSON.stringify([profile.name,profile.gender,profile.updatedAt,
  ...['year','month','day','calendar','leapMonth','hour','minute'].map(key=>profile.birth[key])]);
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
function incompleteInput(value) {
  const birth=value?.birth;
  return !birth||!Number.isInteger(birth.year)||birth.year<1900
    ||!Number.isInteger(birth.month)||birth.month<1
    ||!Number.isInteger(birth.day)||birth.day<1
    ||(birth.hour!=null&&(!Number.isInteger(birth.hour)||!Number.isInteger(birth.minute)));
}

export class SajuProfilePicker {
  constructor({element,store,read,fill,clear,title='저장한 사람',autoSave=null}={}) {
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
    this._selectedStamp=null;
    this._revision=0;
    this._zodiacEpoch=0;
    this._disabled=false;
    this._pending=false;
    this._destroyed=false;
    const doc=element.ownerDocument;
    const fields=autoSave?Array.from(autoSave.fields||[]):[];
    if(autoSave&&(typeof autoSave.read!=='function'||!fields.length
      ||fields.some(field=>field?.ownerDocument!==doc||typeof field.addEventListener!=='function')))throw new SajuSavedProfileError('invalid');
    this._window=doc.defaultView;
    this._auto=autoSave;
    this._autoDelay=Number.isFinite(autoSave?.delay)?Math.max(0,Math.min(2000,autoSave.delay)):600;
    this._autoTimer=null;
    this._autoDirty=false;
    this._autoOwner=null;
    this._hadOwner=false;
    this._composing=new Set();
    this._pointerInPicker=false;
    this._listeners=[];
    const node=(tag,classes,text)=>{
      const value=doc.createElement(tag);
      value.className=classes;
      if(text!==undefined)value.textContent=text;
      return value;
    };
    this._node=node;
    const heading=node('h3','profile-picker-title',title);
    this.countElement=node('span','profile-picker-count');
    this.countElement.hidden=true;
    heading.append(this.countElement);
    const note=node('p','profile-picker-note',autoSave?'입력하면 자동 저장 · 이 기기':'이 기기에 저장');
    this.listElement=node('ul','profile-picker-list');
    this.listElement.setAttribute('aria-label','저장한 출생 정보');
    this.emptyElement=node('p','profile-picker-empty','아직 저장한 사람이 없어요.');
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
    element.replaceChildren(heading,note,this.listElement,this.emptyElement,actions,this.statusElement);
    this.saveButton.addEventListener('click',()=>{void this.saveCurrent();});
    this.newButton.addEventListener('click',()=>{
      if(this._disabled||this._pending)return;
      this.resetSelection();
      try {this.clear();} catch(error) {this._status(messageOf(error),'error');}
    });
    if(!pickers.has(store))pickers.set(store,new Set());
    pickers.get(store).add(this);
    this.refresh();
    if(autoSave) {
      for(const field of new Set(fields)) {
        this._listen(field,'input',event=>{
          if(event.isComposing)this._composing.add(field);
          this.scheduleAutoSave();
        });
        this._listen(field,'change',()=>this.scheduleAutoSave());
        this._listen(field,'compositionstart',()=>{
          this._composing.add(field);
          this._revision++;
          this._cancelAutoSave(false);
        });
        this._listen(field,'compositionend',()=>{
          this._composing.delete(field);
          this.scheduleAutoSave();
        });
        this._listen(field,'focusout',event=>{
          // Saving rebuilds the list. Keep an action button in place until its
          // click runs, including browsers that do not focus clicked buttons.
          if(this._pointerInPicker||this.element.contains(event.relatedTarget))this._cancelAutoSave(false);
          else this.flushAutoSave();
        });
      }
      this._listen(element,'pointerdown',event=>{
        if(!event.target.closest?.('button'))return;
        this._pointerInPicker=true;
        this._cancelAutoSave(false);
      });
      const finishPointer=()=>{
        if(!this._pointerInPicker)return;
        this._pointerInPicker=false;
        this._armAutoSave();
      };
      this._listen(this._window,'pointerup',finishPointer);
      this._listen(this._window,'pointercancel',finishPointer);
      this._listen(element,'focusout',event=>{
        if(!this._pointerInPicker&&!element.contains(event.relatedTarget))this.flushAutoSave();
      });
      this._listen(this._window,'pagehide',()=>this.flushAutoSave());
      this._listen(doc,'visibilitychange',()=>{
        if(doc.visibilityState==='hidden')this.flushAutoSave();
      });
    }
  }

  get selectedId() {return this._selectedId;}

  _listen(target,type,listener) {
    target.addEventListener(type,listener);
    this._listeners.push(()=>target.removeEventListener(type,listener));
  }

  _cancelAutoSave(discard=true) {
    if(this._autoTimer!==null)this._window.clearTimeout(this._autoTimer);
    this._autoTimer=null;
    if(discard) {
      this._autoDirty=false;
      this._autoOwner=null;
      this._composing.clear();
      this._pointerInPicker=false;
    }
  }

  _armAutoSave() {
    this._cancelAutoSave(false);
    if(!this._auto||!this._autoDirty||this._destroyed||this._disabled||this._pending
      ||this._owner===null||this._autoOwner!==this._owner||this._composing.size||this._pointerInPicker)return;
    this._autoTimer=this._window.setTimeout(()=>{
      this._autoTimer=null;
      this.flushAutoSave();
    },this._autoDelay);
  }

  _checkSelected(id) {
    if(id&&profileStamp(this.store.get(id))!==this._selectedStamp)throw new SajuSavedProfileError('not_found');
  }

  scheduleAutoSave() {
    if(!this._auto||this._destroyed||this._disabled)return;
    let owner=null;
    try {owner=this.store.ownerId();} catch {}
    if(owner!==this._owner)this.refresh();
    this._revision++;
    this._autoDirty=true;
    this._autoOwner=this._owner;
    this._status(this._owner===null?'로그인하면 입력한 정보를 자동으로 저장해요.':'입력을 마치면 자동으로 저장돼요.');
    this._armAutoSave();
  }

  // This path is deliberately synchronous so a valid pending edit is written
  // before pagehide/visibilitychange, without waiting for billing or the network.
  flushAutoSave() {
    this._cancelAutoSave(false);
    if(!this._auto||!this._autoDirty||this._destroyed||this._disabled||this._pending
      ||this._autoOwner===null||this._composing.size)return null;
    const owner=this._autoOwner,revision=this._revision,id=this._selectedId;
    try {
      if(this.store.ownerId()!==owner||this._owner!==owner)throw new SajuSavedProfileError('account_changed');
      const value=this._auto.read();
      if(typeof value?.then==='function')throw new SajuSavedProfileError('invalid');
      if(revision!==this._revision||this._destroyed)throw new SajuSavedProfileError('changed');
      if(incompleteInput(value)) {
        this._status('생년월일을 모두 입력하면 자동으로 저장돼요.');
        return null;
      }
      this._checkSelected(id);
      const profile=this.store.save(value,{id,expectedOwner:owner});
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      this._cancelAutoSave();
      this._selectedId=profile.id;
      this._selectedStamp=profileStamp(profile);
      this.refresh({preserveStatus:true});
      this._status('자동으로 저장했어요.','success');
      this._refreshPeers();
      return profile;
    } catch(error) {
      if(['account_changed','not_signed_in','not_found','changed'].includes(error?.code))this._cancelAutoSave();
      this.refresh({preserveStatus:true});
      this._status(messageOf(error),error?.code==='not_signed_in'?'info':'error');
      return null;
    }
  }

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
    this.saveButton.textContent=this._pending?'저장 중…':this._auto?'지금 저장':this._selectedId?'수정한 정보 저장':'이 정보 저장';
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
    const zodiacEpoch=++this._zodiacEpoch;
    this.listElement.replaceChildren();
    this.countElement.hidden=true;
    this.emptyElement.hidden=false;
    this.emptyElement.textContent='아직 저장한 사람이 없어요.';
    if(!preserveStatus)this._status();
    let owner=null;
    try {
      owner=this.store.ownerId();
      const resumeFirstInput=owner!==null&&!this._hadOwner&&this._owner===null&&this._autoDirty;
      if(this._owner!==owner) {
        this._cancelAutoSave(!resumeFirstInput);
        this._owner=owner;
        this._selectedId=null;
        this._selectedStamp=null;
        this._revision++;
        if(resumeFirstInput)this._autoOwner=owner;
      }
      if(owner!==null)this._hadOwner=true;
      const profiles=this.store.list();
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      if(this._selectedId) {
        const selected=profiles.find(profile=>profile.id===this._selectedId);
        if(!selected||profileStamp(selected)!==this._selectedStamp) {
          this._cancelAutoSave();
          this._revision++;
          if(!selected){this._selectedId=null;this._selectedStamp=null;}
          if(!preserveStatus)this._status(new SajuSavedProfileError('not_found').message,'error');
        }
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
        const zodiacLabel=this._node('span','profile-picker-zodiac');
        zodiacLabel.hidden=true;
        use.append(zodiacLabel);
        // Loading a decorative birth label is independent of the local save.
        // A later owner or refresh must never receive an earlier row's result.
        void zodiacModule().then(({zodiacFromBirth})=>{
          if(this._destroyed||zodiacEpoch!==this._zodiacEpoch||this.store.ownerId()!==owner||item.parentNode!==this.listElement)return;
          const zodiac=zodiacFromBirth(profile.birth);
          if(zodiac.status==='unavailable')return;
          zodiacLabel.textContent=`${zodiac.label} · ${zodiac.note}`;
          zodiacLabel.hidden=false;
        }).catch(()=>{});
        use.addEventListener('click',()=>this._use(profile.id,owner));
        const remove=this._node('button','profile-picker-delete','삭제');
        remove.type='button';
        remove.setAttribute('aria-label',label+' 저장 정보 삭제');
        remove.addEventListener('click',()=>this._remove(profile.id,owner));
        item.append(use,remove);
        this.listElement.append(item);
      }
      this.countElement.textContent=profiles.length+'명';
      this.countElement.hidden=!profiles.length;
      this.emptyElement.hidden=profiles.length>0;
      if(!profiles.length&&!preserveStatus&&this.statusElement.dataset.state!=='error')this._status(this._auto?'생년월일을 입력하면 자동으로 저장돼요.':'저장한 정보가 아직 없어요.');
      this._selection();
      if(resumeFirstInput)this._armAutoSave();
      return profiles;
    } catch(error) {
      const waitingForFirstIdentity=error?.code==='not_signed_in'&&!this._hadOwner&&this._owner===null;
      this._cancelAutoSave(!waitingForFirstIdentity);
      this.listElement.replaceChildren();
      this.countElement.hidden=true;
      this.emptyElement.hidden=false;
      this.emptyElement.textContent=error?.code==='not_signed_in'?'로그인하면 저장 목록이 보여요.':'저장 목록을 불러오지 못했어요.';
      this._selectedId=null;
      this._selectedStamp=null;
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
      this._cancelAutoSave();
      this.fill(profile);
      this._selectedId=id;
      this._selectedStamp=profileStamp(profile);
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
      this._cancelAutoSave();
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
    this._cancelAutoSave();
    this._pending=true;
    this._buttons();
    try {
      const owner=this.store.ownerId(),revision=this._revision,id=this._selectedId;
      if(this._owner!==owner)throw new SajuSavedProfileError('account_changed');
      const value=await this.read();
      if(this._destroyed||revision!==this._revision)throw new SajuSavedProfileError('changed');
      this._checkSelected(id);
      const profile=this.store.save(value,{id,expectedOwner:owner});
      if(this.store.ownerId()!==owner)throw new SajuSavedProfileError('account_changed');
      this._selectedId=profile.id;
      this._selectedStamp=profileStamp(profile);
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
      if(!this._destroyed){this._buttons();this._armAutoSave();}
    }
  }

  setDisabled(disabled) {
    const next=Boolean(disabled);
    if(next===this._disabled){this._buttons();return;}
    if(next)this.flushAutoSave();
    this._disabled=next;
    if(this._disabled)this._cancelAutoSave(false);
    else this._armAutoSave();
    this._buttons();
  }

  resetSelection() {
    this._cancelAutoSave();
    this._selectedId=null;
    this._selectedStamp=null;
    this._revision++;
    this._selection();
    this._status();
  }

  destroy() {
    this._cancelAutoSave();
    this._destroyed=true;
    this._revision++;
    for(const remove of this._listeners)remove();
    pickers.get(this.store)?.delete(this);
    this.element.replaceChildren();
  }
}
