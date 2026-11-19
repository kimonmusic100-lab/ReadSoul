import {RangeSetBuilder,StateEffect,StateField,type Extension} from '@codemirror/state';
import {Decoration,EditorView,ViewPlugin,WidgetType,type DecorationSet,type ViewUpdate} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';

export interface WrapObstacle {
 left:number;
 top:number;
 right:number;
 bottom:number;
 ignoreLineEl?:HTMLElement|null;
}

export interface FreeDragBox {
 left:number;
 top:number;
 width:number;
 height:number;
}

export const setFreeDragBoxEffect=StateEffect.define<FreeDragBox|null>();
export const refreshWrapLayoutEffect=StateEffect.define<null>();
const setSpacersEffect=StateEffect.define<DecorationSet>();

const freeDragBoxField=StateField.define<FreeDragBox|null>({
 create:()=>null,
 update(value,tr){
  for(const e of tr.effects){
   if(e.is(setFreeDragBoxEffect))return e.value;
  }
  return value;
 },
});

class WrapSpacerWidget extends WidgetType{
 constructor(readonly widthPx:number){super()}
 eq(other:WrapSpacerWidget){return Math.abs(other.widthPx-this.widthPx)<0.8}
 toDOM(){
  const span=document.createElement('span');
  span.className='rs-wrap-spacer';
  span.setAttribute('aria-hidden','true');
  span.contentEditable='false';
  span.style.width=`${Math.max(4,Math.round(this.widthPx))}px`;
  return span;
 }
 ignoreEvent(){return true}
}

function lineTransformY(el:HTMLElement):number{
 const t=el.style.transform;
 if(!t)return 0;
 try{return new DOMMatrix(t).m42}catch{return 0}
}

const SKIP_TEXT_ANCESTOR='.rs-wrap-spacer,.inline-image,.rs-autopair-tab-badge,.rs-code-actions,.task-check,.md-details-toggle,.md-callout-title,.rs-heading-badge,.rs-bullet-dot,.rs-hr-line';
const SKIP_LINE_CLASS=/\b(?:md-heading|md-code-line|md-front-matter|cm-table-line)\b/;
const NO_BREAK_START=/^[，。！？；：、）】》」』”’,.!?;:\)\]]/;

interface LayoutToken {
 docPos:number;
 node:Text;
 offset:number;
 len:number;
 ch:string;
 atomEl?:HTMLElement;
}

interface PlacedSpacer {
 docPos:number;
 width:number;
}

const SHARED_RANGE=typeof document!=='undefined'?document.createRange():null;

function measureTokenRect(token:LayoutToken):DOMRect|null{
 if(token.atomEl){
  const r=token.atomEl.getBoundingClientRect();
  return r.width>0&&r.height>0?r:null;
 }
 if(!SHARED_RANGE||!token.node.isConnected)return null;
 try{
  SHARED_RANGE.setStart(token.node,token.offset);
  SHARED_RANGE.setEnd(token.node,token.offset+token.len);
  const rects=SHARED_RANGE.getClientRects();
  const r=rects.length?rects[0]:SHARED_RANGE.getBoundingClientRect();
  return r&&r.height>0?r:null;
 }catch{
  return null;
 }
}

function createSpacerEl(widthPx:number):HTMLSpanElement{
 const span=document.createElement('span');
 span.className='rs-wrap-spacer';
 span.setAttribute('aria-hidden','true');
 span.contentEditable='false';
 span.style.width=`${Math.max(4,Math.round(widthPx))}px`;
 return span;
}

function insertDomSpacerBefore(
 anchor:LayoutToken,
 tokens:LayoutToken[],
 splitIdx:number,
 widthPx:number,
):HTMLSpanElement{
 const spacer=createSpacerEl(widthPx);
 if(anchor.atomEl){
  anchor.atomEl.parentNode?.insertBefore(spacer,anchor.atomEl);
  return spacer;
 }
 const origNode=anchor.node;
 const cut=anchor.offset;
 if(cut<=0){
  origNode.parentNode?.insertBefore(spacer,origNode);
  return spacer;
 }
 const restNode=origNode.splitText(cut);
 for(let k=splitIdx;k<tokens.length;k++){
  if(tokens[k].atomEl)continue;
  if(tokens[k].node!==origNode)break;
  tokens[k].node=restNode;
  tokens[k].offset-=cut;
 }
 restNode.parentNode?.insertBefore(spacer,restNode);
 return spacer;
}

/**
 * 基于真实浏览器 DOM 行坐标逐行求解自由图片四周环绕所需的 Spacer 位置与宽度。
 * 插入每行 Spacer 后立刻依据真实重排后的 DOM 坐标继续下一行，消除字宽估测导致的累积偏移。
 */
function solveParagraphSpacersDOM(
 tokens:LayoutToken[],
 obstacles:WrapObstacle[],
 originLeft:number,
 originTop:number,
 innerLeft:number,
 innerRight:number,
):PlacedSpacer[]{
 if(!tokens.length||!obstacles.length||innerRight-innerLeft<80)return [];
 const placed:PlacedSpacer[]=[];

 const findVisualLineEnd=(startIdx:number,firstRect:DOMRect):number=>{
  let lineBottom=firstRect.bottom;
  let pos=startIdx;
  while(pos+6<tokens.length){
   const nr=measureTokenRect(tokens[pos+6]);
   if(nr&&nr.top>=lineBottom-3)break;
   if(nr)lineBottom=Math.max(lineBottom,nr.bottom);
   pos+=6;
  }
  const limit=Math.min(tokens.length-1,pos+6);
  let lastInRow=pos;
  for(let k=pos+1;k<=limit;k++){
   const kr=measureTokenRect(tokens[k]);
   if(!kr)continue;
   if(kr.top>=lineBottom-3)break;
   lineBottom=Math.max(lineBottom,kr.bottom);
   lastInRow=k;
  }
  return lastInRow;
 };

 let idx=0;
 let guard=0;
 let lastPushIdx=-1;
 let sameIdxCount=0;

 while(idx<tokens.length&&guard++<120){
  const firstRect=measureTokenRect(tokens[idx]);
  if(!firstRect){
   idx++;
   continue;
  }
  const lineEnd=findVisualLineEnd(idx,firstRect);
  // 计算当前视觉行的垂直包络区间，避免行内上标/下标遗漏碰撞
  let rowTop=firstRect.top-originTop;
  let rowBottom=firstRect.bottom-originTop;
  for(let k=idx+1;k<=lineEnd;k++){
   const kr=measureTokenRect(tokens[k]);
   if(!kr)continue;
   rowTop=Math.min(rowTop,kr.top-originTop);
   rowBottom=Math.max(rowBottom,kr.bottom-originTop);
  }

  const rowHits=obstacles
   .filter(o=>rowBottom>o.top&&rowTop<o.bottom)
   .sort((a,b)=>a.left-b.left);

  if(!rowHits.length){
   idx=lineEnd+1;
   continue;
  }

  const obs=rowHits[0];
  const availLeft=obs.left-innerLeft;
  const availRight=innerRight-obs.right;

  let splitIdx=idx;
  let leftEndX=innerLeft;

  if(availLeft>=24){
   let k=idx;
   while(k<=lineEnd){
    const kr=measureTokenRect(tokens[k]);
    if(kr){
     const krRight=kr.right-originLeft;
     if(krRight>obs.left+0.5)break;
     leftEndX=krRight;
    }
    k++;
   }
   splitIdx=k;
   // 标点避头尾：避免句号、逗号等孤零零出现在图片右侧开头
   if(splitIdx>idx+1&&splitIdx<=lineEnd&&NO_BREAK_START.test(tokens[splitIdx].ch)){
    splitIdx--;
    const prevR=measureTokenRect(tokens[splitIdx-1]);
    leftEndX=prevR?prevR.right-originLeft:innerLeft;
   }
  }

  // 本行文字全在图片左侧就已经换行结束，无需避让
  if(splitIdx>lineEnd){
   idx=lineEnd+1;
   continue;
  }

  if(splitIdx===lastPushIdx){
   sameIdxCount++;
   if(sameIdxCount>=8){
    idx=splitIdx+1;
    sameIdxCount=0;
    continue;
   }
  }else{
   lastPushIdx=splitIdx;
   sameIdxCount=0;
  }

  const maxFitsInRow=Math.max(4,Math.floor(innerRight-leftEndX-2));
  let spacerW=availRight>=22
   ?Math.min(maxFitsInRow,Math.max(4,Math.ceil(obs.right-leftEndX)))
   :maxFitsInRow;

  const anchor=tokens[splitIdx];
  const spacerEl=insertDomSpacerBefore(anchor,tokens,splitIdx,spacerW);

  // 二次闭环校准：按插完 spacer 后的实际字符左边界消除任何 1~2px 亚像素偏差
  const pushedRect=measureTokenRect(tokens[splitIdx]);
  if(pushedRect&&availRight>=22){
   const pushedTop=pushedRect.top-originTop;
   const pushedLeft=pushedRect.left-originLeft;
   if(pushedTop<rowBottom-3&&pushedLeft<obs.right-0.5){
    const delta=Math.ceil(obs.right-pushedLeft);
    const adjusted=Math.min(maxFitsInRow,spacerW+delta);
    if(adjusted>spacerW){
     spacerW=adjusted;
     spacerEl.style.width=`${spacerW}px`;
    }
   }
  }

  placed.push({docPos:anchor.docPos,width:spacerW});

  const newRect=measureTokenRect(tokens[splitIdx]);
  if(!newRect){
   idx=splitIdx+1;
  }else if(newRect.top-originTop>=rowBottom-3){
   // 后推片段已换到下一视觉行，下一轮直接从该字符的新视觉行继续判断
   idx=splitIdx;
  }else{
   // 后推片段紧邻图片右侧排在同一视觉行，直接扫描本行右侧末尾的真实字符断点
   const rightRowEnd=findVisualLineEnd(splitIdx,newRect);
   idx=Math.max(splitIdx+1,rightRowEnd+1);
  }
 }

 return placed;
}

function cloneLineForMeasure(
 view:EditorView,
 origNode:Node,
 tokens:LayoutToken[],
):Node|null{
 if(origNode.nodeType===Node.TEXT_NODE){
  const txt=origNode as Text;
  if(!txt.data)return null;
  let basePos=-1;
  try{basePos=view.posAtDOM(txt,0)}catch{}
  const clonedTxt=document.createTextNode(txt.data);
  if(basePos>=0){
   const s=txt.data;
   for(let i=0;i<s.length;){
    const code=s.charCodeAt(i);
    const step=(code>=0xD800&&code<=0xDBFF&&i+1<s.length)?2:1;
    tokens.push({
     docPos:basePos+i,
     node:clonedTxt,
     offset:i,
     len:step,
     ch:s.slice(i,i+step),
    });
    i+=step;
   }
  }
  return clonedTxt;
 }

 if(origNode.nodeType===Node.ELEMENT_NODE){
  const el=origNode as HTMLElement;
  if(el.classList.contains('rs-wrap-spacer')||el.classList.contains('cm-widgetBuffer'))return null;
  if(el.classList.contains('image-wrap-free'))return null;
  if(el.classList.contains('rs-md-mark-ghost'))return el.cloneNode(true);
  if(el.matches(SKIP_TEXT_ANCESTOR))return el.cloneNode(true);
  if(el.classList.contains('rendered-math')){
   const cloneMath=el.cloneNode(true) as HTMLElement;
   const fromAttr=Number(el.dataset.mathFrom);
   if(Number.isFinite(fromAttr)){
    const dummy=document.createTextNode('');
    tokens.push({docPos:fromAttr,node:dummy,offset:0,len:0,ch:'M',atomEl:cloneMath});
   }
   return cloneMath;
  }
  const cloneEl=el.cloneNode(false) as HTMLElement;
  if(cloneEl.classList.contains('cm-line')){
   cloneEl.style.transform='';
  }
  for(let c=el.firstChild;c;c=c.nextSibling){
   const child=cloneLineForMeasure(view,c,tokens);
   if(child)cloneEl.appendChild(child);
  }
  return cloneEl;
 }
 return null;
}

function collectObstacles(view:EditorView):WrapObstacle[]{
 const obstacles:WrapObstacle[]=[];
 const contentRect=view.contentDOM.getBoundingClientRect();
 const dragBox=view.state.field(freeDragBoxField,false);

 if(dragBox){
  obstacles.push({
   left:dragBox.left-14,
   top:dragBox.top-6,
   right:dragBox.left+dragBox.width+14,
   bottom:dragBox.top+dragBox.height+10,
  });
 }

 const freeWidgets=view.contentDOM.querySelectorAll<HTMLElement>('.inline-image.image-wrap-free:not(.image-drag-placeholder)');
 for(const el of freeWidgets){
  const frame=el.querySelector<HTMLElement>('.image-frame');
  if(!frame)continue;
  const r=frame.getBoundingClientRect();
  if(r.width<8||r.height<8)continue;
  const lineEl=el.closest<HTMLElement>('.cm-line');
  const dy=lineEl?lineTransformY(lineEl):0;
  obstacles.push({
   left:r.left-contentRect.left-14,
   top:r.top-dy-contentRect.top-6,
   right:r.right-contentRect.left+14,
   bottom:r.bottom-dy-contentRect.top+10,
   ignoreLineEl:null,
  });
 }

 return obstacles;
}

function computeSpacersForView(view:EditorView):PlacedSpacer[]{
 const obstacles=collectObstacles(view);
 if(!obstacles.length)return [];
 const contentRect=view.contentDOM.getBoundingClientRect();
 if(contentRect.width<120)return [];

 const minTop=Math.min(...obstacles.map(o=>o.top))-12;
 const maxBottom=Math.max(...obstacles.map(o=>o.bottom))+12;
 const lineEls=view.contentDOM.querySelectorAll<HTMLElement>('.cm-line');

 const candidates:{lineEl:HTMLElement;lineTop:number}[]=[];
 for(const lineEl of lineEls){
  if(SKIP_LINE_CLASS.test(lineEl.className))continue;
  if(lineEl.querySelector('.rendered-table,.rendered-mermaid,.rs-math-card,.image-wrap-left,.image-wrap-right'))continue;
  const r=lineEl.getBoundingClientRect();
  if(r.height<=1)continue;
  const dy=lineTransformY(lineEl);
  const lineTop=r.top-dy-contentRect.top;
  const lineBottom=r.bottom-dy-contentRect.top;
  if(lineBottom<minTop||lineTop>maxBottom)continue;
  try{
   const pos=view.posAtDOM(lineEl,0);
   const tree=syntaxTree(view.state);
   let skip=false;
   for(let n:SyntaxNode|null=tree.resolveInner(pos,1);n;n=n.parent){
    if(/^(ATXHeading|SetextHeading|FencedCode|CodeBlock|Table|MathBlock|MathFence|MermaidFence|HTMLBlock)/.test(n.name)){skip=true;break}
   }
   if(skip)continue;
  }catch{}
  candidates.push({lineEl,lineTop});
 }
 if(!candidates.length)return [];

 // 挂载离屏同样式测量容器（位于 .cm-scroller 内、.cm-content 外），不触发 CM contentDOM 监听
 const measureHost=document.createElement('div');
 measureHost.className=view.contentDOM.className;
 measureHost.setAttribute('aria-hidden','true');
 measureHost.style.cssText=`position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;width:${contentRect.width}px;margin:0;box-sizing:border-box;z-index:-1;`;
 view.scrollDOM.appendChild(measureHost);

 const spacers:PlacedSpacer[]=[];
 try{
  for(const {lineEl,lineTop} of candidates){
   measureHost.textContent='';
   const tokens:LayoutToken[]=[];
   const clonedLine=cloneLineForMeasure(view,lineEl,tokens);
   if(!(clonedLine instanceof HTMLElement)||!tokens.length)continue;
   measureHost.appendChild(clonedLine);

   const hostRect=measureHost.getBoundingClientRect();
   const lineRect=clonedLine.getBoundingClientRect();
   const clcs=getComputedStyle(clonedLine);
   const padLeft=parseFloat(clcs.paddingLeft)||0;
   const padRight=parseFloat(clcs.paddingRight)||0;
   const innerLeft=(lineRect.left-hostRect.left)+padLeft;
   const innerRight=(lineRect.right-hostRect.left)-padRight;

   // 将障碍物坐标转为相对于当前克隆行顶部的值（originTop = lineRect.top）
   const localObstacles:WrapObstacle[]=obstacles.map(o=>({
    left:o.left,
    right:o.right,
    top:o.top-lineTop,
    bottom:o.bottom-lineTop,
   }));

   const lineSpacers=solveParagraphSpacersDOM(
    tokens,
    localObstacles,
    hostRect.left,
    lineRect.top,
    innerLeft,
    innerRight,
   );
   for(const s of lineSpacers)spacers.push(s);
  }
 }finally{
  measureHost.remove();
 }

 return spacers;
}

function spacersSignature(list:PlacedSpacer[]):string{
 return list.map(s=>`${s.docPos}:${Math.round(s.width)}`).join(',');
}

function buildSpacerDecorations(list:PlacedSpacer[],docLen:number):DecorationSet{
 const builder=new RangeSetBuilder<Decoration>();
 const sorted=list.filter(s=>s.docPos>=0&&s.docPos<=docLen).sort((a,b)=>a.docPos-b.docPos);
 for(const s of sorted){
  builder.add(s.docPos,s.docPos,Decoration.widget({widget:new WrapSpacerWidget(s.width),side:-1}));
 }
 return builder.finish();
}

function syncEditorFreeImageFrames(view:EditorView){
 const colW=Math.max(200,view.contentDOM.getBoundingClientRect().width);
 const els=view.contentDOM.querySelectorAll<HTMLElement>('.inline-image.image-wrap-free');
 for(const el of els){
  const frame=el.querySelector<HTMLElement>('.image-frame');
  const img=frame?.querySelector<HTMLImageElement>('img');
  if(!frame||!img)continue;
  const xRatio=Number(el.dataset.freeX??'0.5');
  const yOff=Number(el.dataset.freeY??'0');
  const baseW=Number(el.dataset.freeW??'0');
  const defaultW=Math.round(Math.min(250,Math.max(150,colW*0.36)));
  const maxAllowed=Math.round(colW*0.48);
  const w=baseW>0?Math.min(baseW,maxAllowed):defaultW;
  const leftPx=Math.round(Math.max(0,Math.min(1,xRatio))*Math.max(0,colW-w));
  img.style.width=w+'px';
  frame.style.left=leftPx+'px';
  frame.style.top=Math.round(yOff)+'px';
 }
}

export function createFreeImageWrapPlugin():Extension{
 const spacerState=StateField.define<DecorationSet>({
  create:()=>Decoration.none,
  update(value,tr){
   for(const e of tr.effects){
    if(e.is(setSpacersEffect))return e.value;
   }
   if(tr.docChanged)return value.map(tr.changes);
   return value;
  },
  provide:f=>EditorView.decorations.from(f),
 });

 const plugin=ViewPlugin.fromClass(class{
  private sig='';
  private raf=0;
  private destroyed=false;
  private ro:ResizeObserver|null=null;

  constructor(readonly view:EditorView){
   if(typeof ResizeObserver!=='undefined'){
    this.ro=new ResizeObserver(()=>{if(!this.destroyed)this.schedule()});
    this.ro.observe(view.contentDOM);
   }
   this.schedule();
  }

  update(u:ViewUpdate){
   const refresh=u.transactions.some(tr=>tr.effects.some(e=>e.is(setFreeDragBoxEffect)||e.is(refreshWrapLayoutEffect)));
   if(refresh||u.docChanged||u.viewportChanged||u.geometryChanged){
    this.schedule();
   }
  }

  private schedule(){
   if(this.destroyed||this.raf)return;
   this.raf=requestAnimationFrame(()=>{
    this.raf=0;
    if(this.destroyed||!this.view.dom.isConnected)return;
    syncEditorFreeImageFrames(this.view);
    const list=computeSpacersForView(this.view);
    const nextSig=spacersSignature(list);
    if(nextSig===this.sig)return;
    this.sig=nextSig;
    this.view.dispatch({
     effects:setSpacersEffect.of(buildSpacerDecorations(list,this.view.state.doc.length)),
    });
   });
  }

  destroy(){
   this.destroyed=true;
   this.ro?.disconnect();
   if(this.raf)cancelAnimationFrame(this.raf);
  }
 });

 return [freeDragBoxField,spacerState,plugin];
}

function collectPreviewTokens(p:HTMLElement):LayoutToken[]{
 const tokens:LayoutToken[]=[];
 const walk=(root:Node)=>{
  for(let c=root.firstChild;c;c=c.nextSibling){
   if(c.nodeType===Node.ELEMENT_NODE){
    const el=c as HTMLElement;
    if(el.matches('.rs-wrap-spacer,img'))continue;
    if(el.classList.contains('katex')){
     const dummy=document.createTextNode('');
     tokens.push({docPos:0,node:dummy,offset:0,len:0,ch:'M',atomEl:el});
     continue;
    }
    walk(el);
   }else if(c.nodeType===Node.TEXT_NODE){
    const txt=c as Text;
    const s=txt.data;
    if(!s)continue;
    for(let i=0;i<s.length;){
     const code=s.charCodeAt(i);
     const step=(code>=0xD800&&code<=0xDBFF&&i+1<s.length)?2:1;
     tokens.push({docPos:0,node:txt,offset:i,len:step,ch:s.slice(i,i+step)});
     i+=step;
    }
   }
  }
 };
 walk(p);
 return tokens;
}

/** 用于阅读视图 / 双栏预览区渲染 md-wrap-free 图片的四面环绕布局（真 DOM 逐行精测避让）。 */
export function applyFreeWrapToPreview(root:HTMLElement){
 root.querySelectorAll('.rs-wrap-spacer').forEach(el=>el.remove());
 const images=Array.from(root.querySelectorAll<HTMLElement>('img.md-wrap-free'));
 if(!images.length)return;

 for(const img of images){
  if(img instanceof HTMLImageElement&&!img.complete){
   img.addEventListener('load',()=>applyFreeWrapToPreview(root),{once:true});
  }
  const parentP=img.closest<HTMLElement>('p');
  if(!parentP)continue;
  parentP.classList.add('md-wrap-free-host');
  const pColW=Math.max(120,parentP.clientWidth||parentP.getBoundingClientRect().width);
  const rawX=Number(img.dataset.x);
  const rawY=Number(img.dataset.y||'0');
  const attrW=Number(img.getAttribute('width'))||Math.round(Math.min(250,Math.max(150,pColW*0.36)));
  const maxW=Math.round(pColW*0.48);
  const w=Math.min(attrW,maxW);
  img.style.width=`${w}px`;
  const xRatio=Number.isFinite(rawX)?Math.max(0,Math.min(1,rawX)):0.5;
  const leftPx=Math.round(xRatio*Math.max(0,pColW-w));
  const topOffset=Number.isFinite(rawY)?rawY:0;
  img.style.left=`${leftPx}px`;
  img.style.top=`${topOffset}px`;
 }

 for(const p of root.querySelectorAll<HTMLElement>('p')){
  if(p.querySelector('img:not(.md-wrap-free)'))continue;
  p.normalize();
  const rootRect=root.getBoundingClientRect();
  const pr=p.getBoundingClientRect();
  const pcs=getComputedStyle(p);
  const padLeft=parseFloat(pcs.paddingLeft)||0;
  const padRight=parseFloat(pcs.paddingRight)||0;
  const pLeft=pr.left-rootRect.left;
  const pTop=pr.top-rootRect.top;
  const pBottom=pr.bottom-rootRect.top;

  // 对每个段落实时读取最新图片矩形，保证上一段新增换行推低本段时坐标依然 100% 对齐
  const obstacles:WrapObstacle[]=images.map(img=>{
   const r=img.getBoundingClientRect();
   return {
    left:r.left-rootRect.left-14,
    top:r.top-rootRect.top-6,
    right:r.right-rootRect.left+14,
    bottom:r.bottom-rootRect.top+10,
   };
  }).filter(o=>o.right>o.left&&o.bottom>o.top&&o.top<=pBottom+12&&o.bottom>=pTop-12);
  if(!obstacles.length)continue;

  const tokens=collectPreviewTokens(p);
  if(!tokens.length)continue;

  solveParagraphSpacersDOM(
   tokens,
   obstacles,
   rootRect.left,
   rootRect.top,
   pLeft+padLeft,
   pLeft+pr.width-padRight,
  );
 }
}
