import {EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';
import type {Extension} from '@codemirror/state';

const TAU=0.034;
const SNAP_DISTANCE=640;
const IDLE_DELAY=520;

interface Rect{x:number;y:number;h:number}

function reducedMotion():boolean{
 return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function measureCaret(view:EditorView):Rect|null{
 if(!view.hasFocus||view.state.readOnly||reducedMotion())return null;
 if(view.dom.closest('.read-layout'))return null;
 const sel=view.state.selection;
 if(sel.ranges.length!==1||!sel.main.empty)return null;
 const active=document.activeElement;
 if(active&&active!==view.contentDOM&&!view.contentDOM.contains(active))return null;
 // Wait until document line coords are laid out and visible inside the view.
 const coords=view.coordsAtPos(sel.main.head,sel.main.assoc||1);
 if(!coords)return null;
 const host=view.dom.getBoundingClientRect();
 const h=Math.max(14,coords.bottom-coords.top);
 return {
  x:coords.left-host.left,
  y:coords.top-host.top,
  h,
 };
}

class CaretGlidePlugin{
 private caret:HTMLDivElement;
 private current:Rect|null=null;
 private target:Rect|null=null;
 private raf=0;
 private lastTime=0;
 private idleTimer:ReturnType<typeof setTimeout>|0=0;
 private destroyed=false;
 private measureQueued=false;

 constructor(readonly view:EditorView){
  this.caret=document.createElement('div');
  this.caret.className='rs-glide-caret';
  this.caret.setAttribute('aria-hidden','true');
  this.caret.hidden=true;
  view.dom.append(this.caret);
  this.scheduleMeasure(false);
 }

 update(u:ViewUpdate){
  if(u.docChanged||u.selectionSet||u.focusChanged||u.geometryChanged||u.viewportChanged){
   const keepActive=u.docChanged||u.selectionSet;
   this.scheduleMeasure(keepActive);
  }
 }

 private scheduleMeasure(keepActive:boolean){
  if(this.destroyed||this.measureQueued)return;
  this.measureQueued=true;
  this.view.requestMeasure({
   key:this,
   read:()=>measureCaret(this.view),
   write:(next)=>{
    this.measureQueued=false;
    if(this.destroyed)return;
    this.applyTarget(next,keepActive);
   },
  });
 }

 private applyTarget(next:Rect|null,keepActive:boolean){
  if(!next){
   this.hide();
   return;
  }
  this.view.dom.classList.add('rs-glide-caret-active');
  this.caret.hidden=false;
  if(!this.current){
   this.current={...next};
   this.target={...next};
   this.paint(this.current);
   this.bumpIdle();
   return;
  }
  const dist=Math.hypot(next.x-this.current.x,next.y-this.current.y);
  if(dist>SNAP_DISTANCE){
   this.current={...next};
   this.target={...next};
   this.paint(this.current);
   this.bumpIdle();
   return;
  }
  this.target={...next};
  if(keepActive||Math.abs(next.x-this.current.x)>=0.25||Math.abs(next.y-this.current.y)>=0.25||Math.abs(next.h-this.current.h)>=0.25){
   this.bumpIdle();
   this.startLoop();
  }
 }

 private bumpIdle(){
  if(this.idleTimer)clearTimeout(this.idleTimer);
  this.caret.classList.remove('is-idle');
  this.idleTimer=setTimeout(()=>{
   this.idleTimer=0;
   if(!this.destroyed&&!this.caret.hidden)this.caret.classList.add('is-idle');
  },IDLE_DELAY);
 }

 private startLoop(){
  if(this.raf)return;
  this.lastTime=performance.now();
  const tick=(now:number)=>{
   this.raf=0;
   if(this.destroyed||!this.current||!this.target)return;
   const dt=Math.min(0.1,Math.max(0,(now-this.lastTime)/1000));
   this.lastTime=now;
   const alpha=1-Math.exp(-dt/TAU);
   this.current.x+=(this.target.x-this.current.x)*alpha;
   this.current.y+=(this.target.y-this.current.y)*alpha;
   this.current.h+=(this.target.h-this.current.h)*alpha;
   if(
    Math.abs(this.target.x-this.current.x)<0.22&&
    Math.abs(this.target.y-this.current.y)<0.22&&
    Math.abs(this.target.h-this.current.h)<0.22
   ){
    this.current={...this.target};
    this.paint(this.current);
    return;
   }
   this.paint(this.current);
   this.raf=requestAnimationFrame(tick);
  };
  this.raf=requestAnimationFrame(tick);
 }

 private paint(rect:Rect){
  this.caret.style.transform=`translate3d(${rect.x.toFixed(2)}px, ${rect.y.toFixed(2)}px, 0)`;
  this.caret.style.height=`${rect.h.toFixed(2)}px`;
 }

 private hide(){
  if(this.raf){cancelAnimationFrame(this.raf);this.raf=0}
  if(this.idleTimer){clearTimeout(this.idleTimer);this.idleTimer=0}
  this.current=null;
  this.target=null;
  this.caret.hidden=true;
  this.caret.classList.remove('is-idle');
  this.view.dom.classList.remove('rs-glide-caret-active');
 }

 destroy(){
  this.destroyed=true;
  this.hide();
  this.caret.remove();
 }
}

export function createCaretGlide():Extension{
 return ViewPlugin.fromClass(CaretGlidePlugin);
}
