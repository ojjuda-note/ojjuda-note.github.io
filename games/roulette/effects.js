// Short, bounded celebrations attached to the winning cells, independent of
// wallet settlement and input. No canvas loop or pointer-catching overlay.
export class WinEffects{
  constructor({cell,reduced=()=>false,hidden=()=>false}){
    this.cell=cell;this.reduced=reduced;this.hidden=hidden;
    this.active=new Set();this.seen=new Set();
  }
  show(round,result){
    if(typeof round!=='string'||!round||this.hidden()||this.seen.has(round))return false;
    const wins=Array.isArray(result?.wins)?result.wins:[];
    const ids=[...new Set(wins.filter(win=>win&&typeof win.id==='string'&&win.return>0).map(win=>win.id))];
    const targets=ids.map(id=>({id,element:this.cell(id)})).filter(target=>target.element?.isConnected).slice(0,16);
    if(!targets.length)return false;
    this.clear();this.seen.add(round);
    if(this.seen.size>32)this.seen.delete(this.seen.values().next().value);
    const still=this.reduced();
    for(const {id,element} of targets){
      const doc=element.ownerDocument,view=doc.defaultView;
      const burst=doc.createElement('span');burst.className='roulette-win-burst'+(still?' is-still':'');
      burst.dataset.round=round;burst.dataset.betId=id;burst.setAttribute('aria-hidden','true');
      const ring=doc.createElement('i');ring.className='roulette-win-ring';burst.append(ring);
      if(!still)for(let index=0;index<12;index++){
        const angle=index*Math.PI/6,distance=27+(index%3)*9;
        const spark=doc.createElement('i');spark.className='roulette-win-spark';
        spark.style.setProperty('--spark-x',Math.round(Math.cos(angle)*distance)+'px');
        spark.style.setProperty('--spark-y',Math.round(Math.sin(angle)*distance)+'px');
        spark.style.setProperty('--spark-turn',(index*30+90)+'deg');
        spark.style.setProperty('--spark-color',['#fff1b5','#f9c65d','#91ead5'][index%3]);
        spark.style.setProperty('--spark-delay',(index%3)*22+'ms');burst.append(spark);
      }
      element.append(burst);
      const active={burst,view,timer:0};this.active.add(active);
      active.timer=view.setTimeout(()=>{burst.remove();this.active.delete(active)},still?520:860);
    }
    return true;
  }
  clear(){
    for(const active of this.active){active.view.clearTimeout(active.timer);active.burst.remove()}
    this.active.clear();
  }
}
