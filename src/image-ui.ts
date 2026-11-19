import {ChangeSet,EditorSelection,StateEffect,StateField,Transaction,type EditorState,type Text as DocText} from '@codemirror/state';
import {EditorView,WidgetType} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {isolateHistory,undo,redo} from '@codemirror/commands';
import {messages,activeLocale} from './i18n';
import {icon} from './icons';
import {tableComposition} from './table-ui';
import {leaveBlock,textBeside} from './block-navigation';
import {frontMatterRange} from './editing';
import {deleteImage,editImage,insertImageAtBase,parseImage,clampImageWidth,imageRanges,type ImageAction,type ImageModel} from './images';
import {setFreeDragBoxEffect,refreshWrapLayoutEffect} from './image-wrap';

type Range={from:number;to:number};
const selectImage=StateEffect.define<Range|null>();
const draggingImage=StateEffect.define<Range|null>();

export const imageSelection=StateField.define<Range|null>({create:()=>null,update(value,tr){
 if(tr.state.readOnly)return null;
 if(value&&tr.docChanged)value={from:tr.changes.mapPos(value.from,-1),to:tr.changes.mapPos(value.to,1)};
 if(tr.selection&&!tr.isUserEvent('undo')&&!tr.isUserEvent('redo')&&!tr.isUserEvent('input.image')&&!tr.isUserEvent('move.image')&&!tr.isUserEvent('move.image.preview')&&!tr.effects.some(e=>e.is(selectImage)))value=null;
 for(const effect of tr.effects)if(effect.is(selectImage))value=effect.value;
 return value;
}});

export const draggingImageSelection=StateField.define<Range|null>({create:()=>null,update(value,tr){
 if(tr.state.readOnly)return null;
 if(value&&tr.docChanged)value={from:tr.changes.mapPos(value.from,-1),to:tr.changes.mapPos(value.to,1)};
 for(const effect of tr.effects)if(effect.is(draggingImage))value=effect.value;
 return value;
}});

export function focusedImageRange(view:EditorView){return view.state.field(imageSelection,false)||null}
export function imageSelected(state:EditorState,from:number){return state.field(imageSelection,false)?.from===from}
export function imageDragged(state:EditorState,from:number){return state.field(draggingImageSelection,false)?.from===from}

const images=new WeakMap<HTMLElement,ImageDOM>();

interface LineSnapshot {
 key:string;
 left:number;
 top:number;
}
interface ActiveMoveSession {
 view:EditorView;
 pointerId:number;
 abort:AbortController;
 startX:number;
 startY:number;
 lastX:number;
 lastY:number;
 prevMoveX:number;
 active:boolean;
 hasDetached:boolean;
 originSrc:string;
 initialModel:ImageModel;
 initialDocText:string;
 initialDoc:DocText;
 initialSelection:EditorSelection;
 initialRange:Range;
 initialWasSelected:boolean;
 delFromInitial:ChangeSet;
 baseToInitial:ChangeSet;
 baseDoc:DocText;
 grabRatioX:number;
 grabRatioY:number;
 normalWidth:number;
 normalHeight:number;
 wrapWidth:number;
 targetH:number;
 finalLeft:number;
 finalTopClient:number;
 floatingEl:HTMLElement|null;
 scrollRaf:number|null;
 moveRaf:number|null;
}

const activeSessions=new Map<EditorView,ActiveMoveSession>();
const lineFlipTimers=new WeakMap<HTMLElement,ReturnType<typeof setTimeout>>();

export function isImageDragging(view?:EditorView):boolean{
 if(view){
  const s=activeSessions.get(view);
  return !!s?.active;
 }
 for(const s of activeSessions.values())if(s.active)return true;
 return false;
}

export function defaultWrapWidth(columnWidth:number):number{
 return Math.round(Math.min(250,Math.max(150,columnWidth*0.36)));
}

function editorScroller(view:EditorView):HTMLElement|null{
 return view.dom.closest<HTMLElement>('.editor-scroll');
}

function paperColumnWidth(view:EditorView):number{
 const w=view.contentDOM.getBoundingClientRect().width;
 return Math.max(200,w||560);
}


/** 读取 .cm-line 当前 FLIP 动画的纵向偏移，确保布局测量始终不受过渡动画干扰。 */
function lineTransformOffsetY(node:Node|null):number{
 const lineEl=(node instanceof HTMLElement?node:node?.parentElement)?.closest<HTMLElement>('.cm-line');
 if(!lineEl)return 0;
 const t=getComputedStyle(lineEl).transform;
 if(!t||t==='none')return 0;
 try{return new DOMMatrix(t).m42||0}catch{return 0}
}


/** 提取视口内正文 .cm-line 的唯一键值和当前渲染坐标（用于 FLIP 动画）。 */
function snapshotEditorLines(view:EditorView):LineSnapshot[]{
 const lines:LineSnapshot[]=[];
 const seen=new Map<string,number>();
 const scroller=editorScroller(view);
 const vTop=scroller?scroller.getBoundingClientRect().top-120:-120;
 const vBottom=scroller?scroller.getBoundingClientRect().bottom+120:window.innerHeight+120;

 for(const el of view.contentDOM.querySelectorAll<HTMLElement>('.cm-line')){
  if(el.querySelector('.inline-image:not(.image-inline-flow)'))continue;
  const text=el.textContent?.trim()||'';
  if(!text)continue;
  const rect=el.getBoundingClientRect();
  if(rect.bottom<vTop||rect.top>vBottom)continue;
  const prefix=text.slice(0,14);
  const count=seen.get(prefix)||0;
  seen.set(prefix,count+1);
  lines.push({key:`${prefix}#${count}`,left:rect.left,top:rect.top});
 }
 return lines;
}

/** 文档重排后对发生位移的正文行施加 FLIP 流体滑移过渡，打造实时水波让位效果。 */
function applyLinesFlip(view:EditorView,before:LineSnapshot[]){
 if(!before.length)return;
 const oldMap=new Map<string,{left:number;top:number}>();
 for(const item of before)oldMap.set(item.key,{left:item.left,top:item.top});

 const seen=new Map<string,number>();
 const animated:HTMLElement[]=[];

 for(const el of view.contentDOM.querySelectorAll<HTMLElement>('.cm-line')){
  if(el.querySelector('.inline-image:not(.image-inline-flow)'))continue;
  const text=el.textContent?.trim()||'';
  if(!text)continue;
  const prefix=text.slice(0,14);
  const count=seen.get(prefix)||0;
  seen.set(prefix,count+1);
  const prev=oldMap.get(`${prefix}#${count}`);
  if(!prev)continue;

  const prevTimer=lineFlipTimers.get(el);
  if(prevTimer){clearTimeout(prevTimer);lineFlipTimers.delete(el)}
  el.style.transition='none';
  el.style.transform='';

  const now=el.getBoundingClientRect();
  const dx=prev.left-now.left;
  const dy=prev.top-now.top;
  if((Math.abs(dx)>1.5||Math.abs(dy)>1.5)&&Math.abs(dx)<520&&Math.abs(dy)<420){
   el.style.transform=`translate3d(${dx}px, ${dy}px, 0)`;
   animated.push(el);
  }
 }

 if(!animated.length)return;
 void view.contentDOM.offsetHeight;
 requestAnimationFrame(()=>{
  for(const el of animated){
   if(!el.isConnected)continue;
   el.style.transition='transform 210ms cubic-bezier(.22, 1, .36, 1)';
   el.style.transform='translate3d(0, 0, 0)';
   const timer=setTimeout(()=>{
    if(!el.isConnected)return;
    el.style.transition='';
    el.style.transform='';
    lineFlipTimers.delete(el);
   },230);
   lineFlipTimers.set(el,timer);
  }
 });
}

function computeFreeBox(session:ActiveMoveSession,clientX:number,clientY:number){
 const contentRect=session.view.contentDOM.getBoundingClientRect();
 const col=Math.max(200,contentRect.width);
 const w=session.wrapWidth;
 const h=session.targetH;
 const rawLeft=clientX-w*session.grabRatioX-contentRect.left;
 const left=Math.max(0,Math.min(col-w,rawLeft));
 const minTopClient=contentRect.top-8;
 const topClient=Math.max(minTopClient,clientY-h*session.grabRatioY);
 const topRel=topClient-contentRect.top;
 return {left,topRel,topClient,width:w,height:h,col};
}

function positionFloatingLayer(session:ActiveMoveSession,clientX:number,clientY:number){
 const el=session.floatingEl;
 if(!el)return;
 const w=el.offsetWidth||session.wrapWidth;
 const h=el.offsetHeight||session.targetH||w*0.66;
 const left=clientX-w*session.grabRatioX;
 const top=clientY-h*session.grabRatioY;
 el.style.transform=`translate3d(${left}px, ${top}px, 0) scale(1.02)`;
}

function syncDropPreview(session:ActiveMoveSession){
 if(!session.active)return;
 const view=session.view;
 const box=computeFreeBox(session,session.lastX,session.lastY);
 session.finalLeft=box.left;
 session.finalTopClient=box.topClient;

 const el=session.floatingEl;
 if(el&&Math.abs(parseFloat(el.style.width)-box.width)>1){
  el.style.width=box.width+'px';
 }

 if(!session.hasDetached){
  session.hasDetached=true;
  const scroller=editorScroller(view);
  const prevScrollTop=scroller?.scrollTop??0;
  const beforeSnapshot=snapshotEditorLines(view);
  view.dispatch({
   changes:session.delFromInitial,
   effects:[
    draggingImage.of(null),
    selectImage.of(null),
    setFreeDragBoxEffect.of({left:box.left,top:box.topRel,width:box.width,height:box.height}),
   ],
   annotations:Transaction.addToHistory.of(false),
   userEvent:'move.image.preview',
  });
  if(scroller&&Math.abs(scroller.scrollTop-prevScrollTop)>0.5){
   scroller.scrollTop=prevScrollTop;
  }
  applyLinesFlip(view,beforeSnapshot);
  return;
 }

 view.dispatch({
  effects:setFreeDragBoxEffect.of({left:box.left,top:box.topRel,width:box.width,height:box.height}),
  annotations:Transaction.addToHistory.of(false),
 });
}

function findDropAnchor(view:EditorView,finalTopClient:number){
 const doc=view.state.doc;
 const meta=frontMatterRange(view.state);
 const tree=syntaxTree(view.state);
 const minPos=meta?Math.min(doc.length,meta.to+1):0;
 interface HostLine {pos:number;top:number;bottom:number;hasText:boolean}
 const hosts:HostLine[]=[];
 const lineEls=view.contentDOM.querySelectorAll<HTMLElement>('.cm-line');
 for(const el of lineEls){
  if(/\b(?:md-heading|md-code-line|md-front-matter|cm-table-line)\b/.test(el.className))continue;
  if(el.querySelector('.rendered-table,.rendered-mermaid,.rs-math-card'))continue;
  try{
   const pos=view.posAtDOM(el,0);
   const line=doc.lineAt(pos);
   if(line.from<minPos)continue;
   let skip=false;
   for(let n:ReturnType<typeof tree.resolveInner>|null=tree.resolveInner(line.from,1);n;n=n.parent){
    if(/^(ATXHeading|SetextHeading|FencedCode|CodeBlock|Table|MathBlock|MathFence|MermaidFence|HTMLBlock)/.test(n.name)){skip=true;break}
   }
   if(skip)continue;
   const r=el.getBoundingClientRect();
   const dy=lineTransformOffsetY(el);
   const top=r.top-dy,bottom=r.bottom-dy;
   hosts.push({pos:line.from,top,bottom,hasText:line.text.trim().length>0});
  }catch{}
 }
 if(!hosts.length)return {pos:doc.length,inline:false,yOffset:0};
 for(const h of hosts){
  if(finalTopClient>=h.top-8&&finalTopClient<=h.bottom-2){
   return {pos:h.pos,inline:h.hasText,yOffset:Math.max(0,Math.round(finalTopClient-h.top))};
  }
 }
 let best=hosts[0],bestDist=Infinity;
 for(const h of hosts){
  const dist=finalTopClient<h.top?h.top-finalTopClient:finalTopClient-h.bottom;
  if(dist<bestDist){bestDist=dist;best=h}
 }
 if(finalTopClient>best.bottom+24){
  return {pos:doc.length,inline:false,yOffset:0};
 }
 const yOff=best.hasText?Math.max(0,Math.min(28,Math.round(finalTopClient-best.top))):0;
 return {pos:best.pos,inline:best.hasText,yOffset:yOff};
}

function updateMoveSession(session:ActiveMoveSession,clientX:number,clientY:number){
 session.lastX=clientX;
 session.lastY=clientY;
 positionFloatingLayer(session,clientX,clientY);
 if(session.moveRaf===null){
  session.moveRaf=requestAnimationFrame(()=>{
   session.moveRaf=null;
   if(session.active)syncDropPreview(session);
  });
 }
}

function tickEdgeAutoScroll(session:ActiveMoveSession){
 if(!session.active){session.scrollRaf=null;return}
 const scroller=editorScroller(session.view);
 if(scroller){
  const rect=scroller.getBoundingClientRect();
  const edge=54;
  let delta=0;
  if(session.lastY<rect.top+edge){
   const t=Math.min(1,(rect.top+edge-session.lastY)/edge);
   delta=-Math.round(3+t*11);
  }else if(session.lastY>rect.bottom-edge){
   const t=Math.min(1,(session.lastY-(rect.bottom-edge))/edge);
   delta=Math.round(3+t*11);
  }
  if(delta!==0){
   const prev=scroller.scrollTop;
   scroller.scrollTop+=delta;
   if(scroller.scrollTop!==prev){
    syncDropPreview(session);
   }
  }
 }
 session.scrollRaf=requestAnimationFrame(()=>tickEdgeAutoScroll(session));
}

function settleFloatingAndCleanup(session:ActiveMoveSession,finalFrom:number){
 const el=session.floatingEl;
 const view=session.view;
 session.floatingEl=null;
 if(!el)return;

 const startRect=el.getBoundingClientRect();
 requestAnimationFrame(()=>{
  const targetFrame=view.contentDOM.querySelector<HTMLElement>(`.inline-image[data-from="${finalFrom}"] .image-frame`)
   ||view.contentDOM.querySelector<HTMLElement>('.inline-image.image-selected .image-frame');
  if(!targetFrame){
   el.style.transition='opacity 150ms ease, transform 150ms ease';
   el.style.opacity='0';
   setTimeout(()=>el.remove(),160);
   return;
  }

  const targetImg=targetFrame.querySelector<HTMLElement>('img');
  const endRect=targetFrame.getBoundingClientRect();
  if(targetImg)targetImg.style.visibility='hidden';

  el.style.transition='none';
  el.style.transform=`translate3d(${startRect.left}px, ${startRect.top}px, 0)`;
  el.style.width=startRect.width+'px';
  el.style.height=startRect.height+'px';
  void el.offsetHeight;

  requestAnimationFrame(()=>{
   el.style.transition='transform 220ms cubic-bezier(.22, 1, .36, 1), width 220ms cubic-bezier(.22, 1, .36, 1), height 220ms cubic-bezier(.22, 1, .36, 1), box-shadow 220ms ease, opacity 140ms ease 110ms';
   el.style.transform=`translate3d(${endRect.left}px, ${endRect.top}px, 0)`;
   el.style.width=endRect.width+'px';
   el.style.height=endRect.height+'px';
   el.style.boxShadow='0 0 0 transparent';
   setTimeout(()=>{
    if(targetImg)targetImg.style.visibility='';
    el.remove();
   },235);
  });
 });
}

function endMoveSession(session:ActiveMoveSession,commit:boolean){
 if(session.scrollRaf!==null){cancelAnimationFrame(session.scrollRaf);session.scrollRaf=null}
 if(session.moveRaf!==null){cancelAnimationFrame(session.moveRaf);session.moveRaf=null}

 const view=session.view;
 if(commit&&session.active){
  syncDropPreview(session);
 }

 session.abort.abort();
 if(activeSessions.get(view)===session)activeSessions.delete(view);
 document.body.classList.remove('rs-image-dragging-body');

 if(!session.active){
  session.floatingEl?.remove();
  return;
 }
 session.active=false;

 if(!commit||!session.hasDetached){
  if(session.hasDetached){
   const beforeSnapshot=snapshotEditorLines(view);
   view.dispatch({
    changes:session.baseToInitial,
    selection:session.initialSelection,
    effects:[draggingImage.of(null),setFreeDragBoxEffect.of(null),selectImage.of(session.initialWasSelected?session.initialRange:null)],
    annotations:Transaction.addToHistory.of(false),
    userEvent:'move.image.preview',
   });
   applyLinesFlip(view,beforeSnapshot);
  }else{
   view.dispatch({
    effects:[draggingImage.of(null),setFreeDragBoxEffect.of(null),selectImage.of(session.initialWasSelected?session.initialRange:null)],
    annotations:Transaction.addToHistory.of(false),
   });
  }
  settleFloatingAndCleanup(session,session.initialRange.from);
  return;
 }

 const box=computeFreeBox(session,session.lastX,session.lastY);
 const anchor=findDropAnchor(view,box.topClient);
 const rightGap=Math.max(0,(box.col-box.width)-box.left);
 const nextModel:ImageModel={...session.initialModel,width:box.width};
 delete nextModel.height;

 if(anchor.yOffset<=8&&box.left<=14){
  nextModel.wrap='float';
  nextModel.align='left';
  delete nextModel.x;
  delete nextModel.y;
 }else if(anchor.yOffset<=8&&rightGap<=14){
  nextModel.wrap='float';
  nextModel.align='right';
  delete nextModel.x;
  delete nextModel.y;
 }else{
  nextModel.wrap='free';
  nextModel.align='left';
  nextModel.x=Number((box.left/Math.max(1,box.col-box.width)).toFixed(3));
  if(anchor.yOffset>=2)nextModel.y=anchor.yOffset;
  else delete nextModel.y;
 }

 const inserted=insertImageAtBase(session.baseDoc,anchor.pos,nextModel,anchor.inline);
 const finalRange=inserted.nextRange;
 const initialToFinal=session.delFromInitial.compose(inserted.changes);
 const scroller=editorScroller(view);
 const savedScroll=scroller?.scrollTop??0;

 try{
  view.dispatch({
   changes:session.baseToInitial,
   selection:session.initialSelection,
   effects:[setFreeDragBoxEffect.of(null)],
   annotations:Transaction.addToHistory.of(false),
   userEvent:'move.image.preview',
  });

  const targetState=view.state.update({changes:initialToFinal}).state;
  const beside=textBeside(targetState,finalRange);
  view.dispatch({
   changes:initialToFinal,
   ...(beside!==null?{selection:{anchor:beside}}:{}),
   effects:[draggingImage.of(null),setFreeDragBoxEffect.of(null),selectImage.of(finalRange)],
   annotations:isolateHistory.of('full'),
   userEvent:'move.image',
  });
  if(scroller)scroller.scrollTop=savedScroll;
  settleFloatingAndCleanup(session,finalRange.from);
 }catch{
  view.dispatch({
   effects:[draggingImage.of(null),setFreeDragBoxEffect.of(null),selectImage.of(null)],
   annotations:Transaction.addToHistory.of(false),
  });
  session.floatingEl?.remove();
  session.floatingEl=null;
 }
 requestAnimationFrame(()=>{
  const activeImg=view.contentDOM.querySelector<HTMLElement>('.inline-image.image-selected');
  if(activeImg)activeImg.focus({preventScroll:true});
  else view.focus();
 });
}

export class ImageWidget extends WidgetType{
 readonly locale=activeLocale;
 readonly dest:string;
 constructor(
  readonly raw:string,
  readonly from:number,
  readonly resolve:(dest:string)=>Promise<string>,
  readonly composing:StateField<boolean>,
  readonly selected=false,
  readonly readOnly=false,
  readonly quotes=0,
  readonly listEms=0,
  readonly dragging=false,
  readonly inline=false,
 ){
  super();
  this.dest=parseImage(raw)!.src;
 }
 eq(o:ImageWidget){
  return this.locale===o.locale&&this.raw===o.raw&&this.from===o.from&&this.selected===o.selected&&this.readOnly===o.readOnly&&this.quotes===o.quotes&&this.listEms===o.listEms&&this.dragging===o.dragging&&this.inline===o.inline;
 }
 toDOM(view:EditorView){const image=new ImageDOM(view,this.composing);images.set(image.dom,image);image.update(this);return image.dom}
 updateDOM(dom:HTMLElement){images.get(dom)!.update(this);return true}
 destroy(dom:HTMLElement){images.get(dom)?.destroy();images.delete(dom)}
 ignoreEvent(){return true}
}

class ImageDOM{
 readonly dom=document.createElement('figure');
 private frame=document.createElement('span');
 private img=new Image();
 private removeBtn=document.createElement('button');
 private toolbar=document.createElement('div');
 private handle=document.createElement('button');
 private badge=document.createElement('span');
 private popover=document.createElement('div');
 private input=document.createElement('input');
 private abort=new AbortController();
 private widget!:ImageWidget;
 private source='';
 private selected=false;
 private composingAlt=false;
 private disposed=false;
 private endTimer:ReturnType<typeof setTimeout>|undefined;
 private drag:{id:number;x:number;width:number;value:number;max:number}|null=null;

 constructor(private view:EditorView,private composing:StateField<boolean>){
  const signal=this.abort.signal;
  this.dom.className='inline-image';this.dom.contentEditable='false';this.dom.tabIndex=-1;
  this.frame.className='image-frame';
  this.img.loading='lazy';this.img.draggable=false;
  this.img.onerror=()=>{if(!this.disposed){this.img.hidden=true;this.dom.dataset.error=messages.fImageResourceMissing(this.img.alt||this.source)}};
  this.frame.append(this.img);

  // 右上角轻巧 × 删除按钮
  this.removeBtn.type='button';
  this.removeBtn.className='image-remove-badge';
  this.removeBtn.setAttribute('aria-label',messages.fDeleteImage());
  this.removeBtn.title=messages.fDeleteImage();
  this.removeBtn.append(icon('close'));
  this.removeBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()},{signal});
  this.removeBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.change('delete')},{signal});

  this.toolbar.className='image-toolbar';this.toolbar.setAttribute('role','toolbar');this.toolbar.hidden=true;
  this.handle.type='button';this.handle.className='image-resize-handle';this.handle.hidden=true;
  this.badge.className='image-width-badge';this.badge.hidden=true;this.badge.setAttribute('role','status');
  this.popover.className='image-alt-popover';this.popover.hidden=true;this.input.type='text';this.popover.append(this.input);
  this.frame.append(this.removeBtn,this.handle,this.badge,this.toolbar,this.popover);this.dom.append(this.frame);

  window.addEventListener('resize',()=>this.placeControls(),{signal});
  this.img.addEventListener('load',()=>{
   this.placeControls();
   if(this.widget&&parseImage(this.widget.raw)?.wrap==='free'){
    this.view.dispatch({effects:refreshWrapLayoutEffect.of(null),annotations:Transaction.addToHistory.of(false)});
   }
  },{signal});

  // 按住图片本体发起独立全局拖拽（紧密型环绕 + 段内实时行级跟手）
  this.frame.addEventListener('pointerdown',e=>this.beginMoveDrag(e),{signal});
  this.dom.addEventListener('pointerdown',e=>{
   if(this.blocked()||this.input===e.target)return;
   if(this.frame.contains(e.target as Node))return;
   e.preventDefault();
   if(!this.selected)this.select();else if(!(e.target as HTMLElement).closest('button'))this.dom.focus();
  },{signal});
  this.dom.addEventListener('click',e=>{if(this.blocked()||isImageDragging(this.view))return;e.stopPropagation();if(!this.selected)this.select()},{signal});
  this.dom.addEventListener('focus',()=>{if(!this.selected&&!this.blocked()&&!isImageDragging(this.view))this.select()},{signal});
  this.dom.addEventListener('keydown',e=>this.key(e),{signal});
  this.dom.addEventListener('beforeinput',e=>{if(this.selected&&e.target!==this.input){e.preventDefault();e.stopPropagation()}},{signal});
  for(const type of ['copy','cut'] as const)document.addEventListener(type,e=>{if(!this.selected||this.input===document.activeElement||this.blocked())return;e.preventDefault();e.stopPropagation();e.clipboardData?.setData('text/plain',this.widget.raw);if(type==='cut')this.change('delete')},{capture:true,signal});

  this.input.addEventListener('compositionstart',e=>{e.stopPropagation();this.composingAlt=true;for(const button of this.toolbar.querySelectorAll('button'))button.disabled=true;for(const notify of this.view.state.facet(tableComposition))notify(this.view,true)},{signal});
  this.input.addEventListener('compositionend',e=>{e.stopPropagation();this.endTimer=setTimeout(()=>{if(this.disposed)return;const finish=()=>{this.composingAlt=false;for(const button of this.toolbar.querySelectorAll('button'))button.disabled=this.blocked()};const handlers=this.view.state.facet(tableComposition);if(handlers.length)for(const notify of handlers)notify(this.view,false,finish);else finish()},0)},{signal});

  this.handle.addEventListener('pointerdown',e=>this.down(e),{signal});
  window.addEventListener('pointermove',e=>this.move(e),{signal});
  window.addEventListener('pointerup',e=>this.up(e),{signal});
  window.addEventListener('pointercancel',()=>this.cancel(),{signal});
  window.addEventListener('blur',()=>this.cancel(),{signal});
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&this.drag){e.preventDefault();e.stopImmediatePropagation();this.cancel();this.dom.focus()}
  },{capture:true,signal});

  document.addEventListener('pointerdown',e=>{
   if(!this.selected||this.blocked()||this.dom.contains(e.target as Node))return;
   const target=e.target as HTMLElement;if(target.closest('#format-bar,.block-handles,[role=menu]'))return;
   this.deselect();
  },{capture:true,signal});
  document.addEventListener('focusin',e=>{
   if(this.selected&&!this.blocked()&&!this.dom.contains(e.target as Node)&&!(e.target as HTMLElement).closest('#format-bar,.block-handles,[role=menu]'))this.deselect();
  },{signal});
 }

 private blocked(){return this.widget?.readOnly||this.view.state.readOnly||this.view.composing||this.view.state.field(this.composing)||this.composingAlt}
 private columnWidth(){
  const style=getComputedStyle(this.dom);
  const paper=this.view.contentDOM.getBoundingClientRect().width;
  return Math.max(200,(paper||this.dom.getBoundingClientRect().width)-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
 }

 update(widget:ImageWidget){
  const previous=this.widget;this.widget=widget;const isDragPlaceholder=!!widget.dragging;
  this.selected=widget.selected&&!widget.readOnly&&!isDragPlaceholder;
  const model=parseImage(widget.raw)!;
  if(previous&&previous.raw!==widget.raw){this.cancel()}
  this.dom.dataset.from=String(widget.from);
  this.dom.classList.toggle('image-selected',this.selected);
  this.dom.classList.toggle('image-drag-placeholder',isDragPlaceholder);
  this.dom.classList.toggle('image-inline-flow',!!widget.inline);
  this.dom.classList.toggle('image-wrap-free',model.wrap==='free');
  this.dom.classList.toggle('image-wrap-left',model.wrap==='float'&&model.align==='left');
  this.dom.classList.toggle('image-wrap-right',model.wrap==='float'&&model.align==='right');
  this.dom.tabIndex=widget.readOnly?-1:0;
  this.dom.setAttribute('aria-label',model.alt||messages.fImage());
  this.dom.setAttribute('aria-selected',String(this.selected));
  this.dom.setAttribute('role','group');
  this.img.alt=model.alt;this.img.title=model.title||'';
  if(model.wrap==='free'){
   const colW=paperColumnWidth(this.view);
   const baseW=model.width!==undefined?model.width:defaultWrapWidth(colW);
   const w=Math.min(baseW,Math.round(colW*0.48));
   const xRatio=model.x??0.5;
   const yOff=Math.round(model.y??0);
   this.dom.dataset.freeX=String(xRatio);
   this.dom.dataset.freeY=String(yOff);
   this.dom.dataset.freeW=String(baseW);
   const leftPx=Math.round(xRatio*Math.max(0,colW-w));
   this.img.style.width=w+'px';
   this.frame.style.left=leftPx+'px';
   this.frame.style.top=yOff+'px';
   this.dom.style.textAlign='';
   this.dom.style.paddingLeft='';
  }else{
   delete this.dom.dataset.freeX;
   delete this.dom.dataset.freeY;
   delete this.dom.dataset.freeW;
   this.img.style.width=model.width!==undefined?model.width+'px':'';
   this.frame.style.left='';
   this.frame.style.top='';
   this.dom.style.textAlign=model.wrap==='float'?'':model.align;
   this.dom.style.paddingLeft=model.wrap==='float'?'':'calc('+widget.quotes*14+'px + var(--editor-size) * '+widget.listEms+')';
  }

  this.toolbar.hidden=!this.selected;
  this.handle.hidden=!this.selected;
  this.removeBtn.hidden=!!widget.readOnly||isDragPlaceholder;
  this.toolbar.setAttribute('aria-label',messages.fImageActions());
  this.handle.setAttribute('aria-label',messages.fResizeImage());
  this.handle.title=messages.fResizeImage();
  this.input.setAttribute('aria-label',messages.fImageAlt());

  const currentMode=model.wrap==='float'?(model.align==='right'?'wrap-right':'wrap-left'):model.align;
  const actions:[ImageAction,string,string][]=[
   ['wrap-left','左四周环绕','align-left'],
   ['center','上下居中','align-center'],
   ['wrap-right','右四周环绕','align-right'],
   ['original',messages.fImageOriginalSize(),'maximize'],
   ['alt',messages.fImageAlt(),'image-alt'],
  ];
  actions.forEach(([action,label,name],i)=>{
   let button=this.toolbar.children[i] as HTMLButtonElement|undefined;
   if(!button){
    button=document.createElement('button');button.type='button';button.dataset.imageAction=action;
    button.append(icon(name));
    button.addEventListener('pointerdown',e=>e.stopPropagation());
    button.addEventListener('click',()=>{if(action==='alt')this.editAlt();else this.change(action)});
    this.toolbar.append(button);
   }
   button.title=label;button.setAttribute('aria-label',label);button.disabled=this.blocked();
   if(['wrap-left','center','wrap-right'].includes(action))button.setAttribute('aria-pressed',String(currentMode===action));
  });

  if(!this.selected){this.popover.hidden=true;this.cancel()}
  this.placeControls();
  if(model.src!==this.source){
   this.source=model.src;const source=this.source;this.img.hidden=false;delete this.dom.dataset.error;
   widget.resolve(source).then(url=>{if(!this.disposed&&this.source===source)this.img.src=url}).catch(()=>{if(!this.disposed&&this.source===source){this.img.hidden=true;this.dom.dataset.error=messages.fImageTemporarilyUnreadable(model.alt||source)}});
  }
 }

 private select(){
  if(this.blocked())return;
  this.selected=true;this.dom.focus();
  const range={from:this.widget.from,to:this.widget.from+this.widget.raw.length};
  const at=textBeside(this.view.state,range);
  this.view.dispatch({...(at===null?{}:{selection:{anchor:at}}),effects:selectImage.of(range),userEvent:'select.image'});
 }
 private leave(){
  if(this.blocked())return;
  this.selected=false;this.cancel();
  this.view.dispatch({...leaveBlock(this.view.state,{from:this.widget.from,to:this.widget.from+this.widget.raw.length}),effects:selectImage.of(null)});
  this.view.focus();const {node,offset}=this.view.domAtPos(this.view.state.selection.main.head);getSelection()?.collapse(node,offset);
 }
 private deselect(){
  this.selected=false;this.cancel();
  const at=textBeside(this.view.state,{from:this.widget.from,to:this.widget.from+this.widget.raw.length});
  this.view.dispatch({...(at===null?{}:{selection:{anchor:at}}),effects:selectImage.of(null),userEvent:'select.image'});
 }
 private change(action:ImageAction,value?:string|number){
  if(this.blocked())return;
  this.popover.hidden=true;
  const range={from:this.widget.from,to:this.widget.from+this.widget.raw.length};
  let nextValue=value;
  if((action==='wrap-left'||action==='wrap-right')&&nextValue===undefined){
   const model=parseImage(this.widget.raw),col=this.columnWidth();
   if(model&&model.wrap!=='float'&&(model.width===undefined||model.width>col*0.55)){
    nextValue=defaultWrapWidth(col);
   }
  }
  const animateWrap=['wrap-left','wrap-right','center','left','right'].includes(action);
  const beforeSnapshot=animateWrap?snapshotEditorLines(this.view):null;

  const spec=editImage(this.view.state,range,action,nextValue);
  if(action==='delete'){spec.effects=selectImage.of(null);this.selected=false}
  this.view.dispatch(spec);

  if(action==='delete')this.view.focus();
  else{
   const newRange=this.view.state.field(imageSelection,false);
   if(newRange){
    const beside=textBeside(this.view.state,newRange);
    if(beside!==null)this.view.dispatch({selection:{anchor:beside},effects:selectImage.of(newRange),userEvent:'select.image'});
   }
   if(beforeSnapshot)applyLinesFlip(this.view,beforeSnapshot);
   this.dom.focus();
  }
 }
 private editAlt(){if(this.blocked())return;this.input.value=parseImage(this.widget.raw)!.alt;this.popover.hidden=false;this.input.focus();this.input.select();this.placeControls()}

 private placeControls(){
  requestAnimationFrame(()=>{
   if(this.disposed)return;
   const right=this.frame.getBoundingClientRect().right;
   this.frame.classList.toggle('image-tb-flip',!this.toolbar.hidden&&right-this.toolbar.offsetWidth<8);
   this.frame.classList.toggle('image-pp-flip',!this.popover.hidden&&right-this.popover.offsetWidth<8);
   this.popover.style.maxWidth=!this.popover.hidden&&this.frame.classList.contains('image-pp-flip')?Math.min(256,Math.max(120,innerWidth-8-this.frame.getBoundingClientRect().left))+'px':'';
  });
 }

 private key(e:KeyboardEvent){
  if(e.isComposing||this.blocked())return;
  if(e.target===this.input){
   if(e.key==='Enter'){e.preventDefault();e.stopPropagation();this.change('alt',this.input.value)}
   else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.popover.hidden=true;this.placeControls();this.dom.focus()}
   return;
  }
  if(!this.selected)return;
  const mod=e.ctrlKey&&!e.metaKey,k=e.key.toLowerCase();
  if(mod&&['c','x'].includes(k))return;
  e.stopPropagation();
  if(mod&&['z','y'].includes(k)){e.preventDefault();(k==='y'||e.shiftKey?redo:undo)(this.view);return}
  if(e.key==='Tab'||e.target instanceof HTMLButtonElement&&['Enter',' '].includes(e.key))return;
  e.preventDefault();
  if(e.key==='Escape')this.leave();else if(e.key==='Enter')this.editAlt();else if(e.key==='Delete'||e.key==='Backspace')this.change('delete');
 }

 // --- 缩放拖拽 ---
 private down(e:PointerEvent){
  if(e.button!==0||this.blocked())return;e.preventDefault();e.stopPropagation();this.dom.focus();
  const style=getComputedStyle(this.dom),width=this.img.getBoundingClientRect().width,max=this.columnWidth()-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
  this.drag={id:e.pointerId,x:e.clientX,width,value:Math.round(width),max:Math.max(80,max)};
  try{this.handle.setPointerCapture(e.pointerId)}catch{}
  this.badge.hidden=false;this.badge.textContent=Math.round(width)+' px';
 }
 private move(e:PointerEvent){
  const drag=this.drag;if(!drag||drag.id!==e.pointerId)return;if(this.blocked()){this.cancel();return}
  e.preventDefault();drag.value=clampImageWidth(drag.width+e.clientX-drag.x,drag.max);
  this.img.style.width=drag.value+'px';this.badge.textContent=drag.value+' px';this.view.requestMeasure();
 }
 private up(e:PointerEvent){const drag=this.drag;if(!drag||drag.id!==e.pointerId)return;this.move(e);const value=drag.value;this.cancel();this.change('resize',value)}
 private cancel(){
  if(!this.drag)return;if(this.handle.hasPointerCapture(this.drag.id))this.handle.releasePointerCapture(this.drag.id);this.drag=null;this.badge.hidden=true;
  const width=parseImage(this.widget.raw)?.width;this.img.style.width=width!==undefined?width+'px':'';this.view.requestMeasure();
 }

  // --- 1:1 实图跟手拖拽（全程支持左四周 / 正中居中 / 右四周与文章任意位置自由落位） ---
 private beginMoveDrag(e:PointerEvent){
  if(e.button!==0||this.blocked()||this.drag||activeSessions.has(this.view))return;
  const target=e.target as HTMLElement;
  if(target.closest('.image-resize-handle,.image-remove-badge,.image-toolbar,.image-alt-popover'))return;
  e.preventDefault();
  e.stopPropagation();

  const initialModel=parseImage(this.widget.raw);
  if(!initialModel)return;
  const initialRange={from:this.widget.from,to:this.widget.from+this.widget.raw.length};
  const frameRect=this.img.getBoundingClientRect().width>8?this.img.getBoundingClientRect():this.frame.getBoundingClientRect();
  const col=paperColumnWidth(this.view);
  const normalWidth=Math.max(48,Math.round(frameRect.width));
  const normalHeight=Math.max(32,Math.round(frameRect.height));
  const wrapWidth=initialModel.width!==undefined&&initialModel.width<=col*0.58
   ?initialModel.width
   :defaultWrapWidth(col);
  const targetH=Math.max(32,Math.round(wrapWidth*(normalHeight/Math.max(1,normalWidth))));

  const initialDoc=this.view.state.doc;
  const delSpec=deleteImage(this.view.state,initialRange);
  const delFromInitial=this.view.state.changes(delSpec.changes);
  const baseDoc=delFromInitial.apply(initialDoc);
  const baseToInitial=delFromInitial.invert(initialDoc);

  const abort=new AbortController();
  const signal=abort.signal;
  const session:ActiveMoveSession={
   view:this.view,
   pointerId:e.pointerId,
   abort,
   startX:e.clientX,
   startY:e.clientY,
   lastX:e.clientX,
   lastY:e.clientY,
   prevMoveX:e.clientX,
   active:false,
   hasDetached:false,
   originSrc:this.img.currentSrc||this.img.src,
   initialModel,
   initialDocText:initialDoc.toString(),
   initialDoc,
   initialSelection:this.view.state.selection,
   initialRange,
   initialWasSelected:this.selected,
   delFromInitial,
   baseToInitial,
   baseDoc,
   grabRatioX:Math.min(0.92,Math.max(0.08,(e.clientX-frameRect.left)/Math.max(1,frameRect.width))),
   grabRatioY:Math.min(0.92,Math.max(0.08,(e.clientY-frameRect.top)/Math.max(1,frameRect.height))),
   normalWidth,
   normalHeight,
   wrapWidth,
   targetH,
   finalLeft:Math.max(0,frameRect.left-this.view.contentDOM.getBoundingClientRect().left),
   finalTopClient:frameRect.top,
   floatingEl:null,
   scrollRaf:null,
   moveRaf:null,
  };
  activeSessions.set(this.view,session);

  window.addEventListener('pointermove',ev=>{
   if(ev.pointerId!==session.pointerId)return;
   if(session.view.state.readOnly){endMoveSession(session,false);return}
   if(!session.active){
    if(Math.hypot(ev.clientX-session.startX,ev.clientY-session.startY)<4)return;
    session.active=true;
    document.body.classList.add('rs-image-dragging-body');

    const floating=document.createElement('div');
    floating.className='rs-drag-image-floating';
    floating.style.width=session.wrapWidth+'px';
    const imgCopy=document.createElement('img');
    imgCopy.src=session.originSrc;
    imgCopy.alt=session.initialModel.alt;
    imgCopy.draggable=false;
    floating.append(imgCopy);
    document.body.append(floating);
    session.floatingEl=floating;

    positionFloatingLayer(session,ev.clientX,ev.clientY);
    session.scrollRaf=requestAnimationFrame(()=>tickEdgeAutoScroll(session));
   }
   ev.preventDefault();
   updateMoveSession(session,ev.clientX,ev.clientY);
  },{signal});

  window.addEventListener('pointerup',ev=>{
   if(ev.pointerId!==session.pointerId)return;
   if(!session.active){
    endMoveSession(session,false);
    if(!this.disposed){
     if(!this.selected)this.select();
     else this.dom.focus();
    }
    return;
   }
   session.lastX=ev.clientX;
   session.lastY=ev.clientY;
   endMoveSession(session,true);
  },{signal});

  window.addEventListener('pointercancel',ev=>{
   if(ev.pointerId===session.pointerId)endMoveSession(session,false);
  },{signal});
  window.addEventListener('blur',()=>endMoveSession(session,false),{signal});
  document.addEventListener('keydown',ev=>{
   if(ev.key==='Escape'){
    ev.preventDefault();
    ev.stopImmediatePropagation();
    endMoveSession(session,false);
   }
  },{capture:true,signal});
 }

 destroy(){
  this.disposed=true;
  clearTimeout(this.endTimer);
  this.abort.abort();
  this.cancel();
 }
}
