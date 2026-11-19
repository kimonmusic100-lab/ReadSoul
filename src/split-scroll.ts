import type {EditorView} from '@codemirror/view';

export interface SplitScrollOptions {
 isActive:()=>boolean;
 getView:()=>EditorView|undefined;
 editorScroll:HTMLElement;
 previewScroll:HTMLElement;
 previewHost:HTMLElement;
 onPreviewDrive?:()=>void;
}

export interface SplitScrollController {
 syncNow:(from?:'editor'|'preview')=>void;
 notifyLayoutChange:()=>void;
 dispose:()=>void;
}

interface Anchor {
 e:number;
 p:number;
}

const VIEWPORT_ALIGN_PAD=24;

export function createSplitScrollController(options:SplitScrollOptions):SplitScrollController {
 const {editorScroll,previewScroll,previewHost}=options;
 let activeLock:'editor'|'preview'|null=null;
 let lockFrame=0;
 let lockTimer:ReturnType<typeof setTimeout>|undefined;
 let lastDriver:'editor'|'preview'='editor';
 let resyncFrame=0;
 let disposed=false;

 const clearLock=()=>{
  cancelAnimationFrame(lockFrame);
  lockFrame=0;
  clearTimeout(lockTimer);
  lockTimer=undefined;
 };

 const armLock=(target:'editor'|'preview')=>{
  clearLock();
  activeLock=target;
  lockFrame=requestAnimationFrame(()=>{
   lockTimer=setTimeout(()=>{
    if(activeLock===target)activeLock=null;
   },32);
  });
 };

 const buildAnchors=():{anchors:Anchor[];maxE:number;maxP:number}=>{
  const maxE=Math.max(0,editorScroll.scrollHeight-editorScroll.clientHeight);
  const maxP=Math.max(0,previewScroll.scrollHeight-previewScroll.clientHeight);
  const view=options.getView();
  if(!view||!options.isActive()||(maxE<=0&&maxP<=0)){
   return {anchors:[{e:0,p:0},{e:maxE,p:maxP}],maxE,maxP};
  }
  const anchors:Anchor[]=[{e:0,p:0}];
  const pushAnchor=(e:number,p:number)=>{
   const clampedE=Math.max(0,Math.min(maxE,e));
   const clampedP=Math.max(0,Math.min(maxP,p));
   const last=anchors[anchors.length-1];
   if(clampedE>last.e+0.5&&clampedP>last.p+0.5&&clampedE<maxE-0.5&&clampedP<maxP-0.5){
    anchors.push({e:clampedE,p:clampedP});
   }
  };
  const editorRect=editorScroll.getBoundingClientRect();
  const previewRect=previewScroll.getBoundingClientRect();
  const editorDocOrigin=view.documentTop-editorRect.top+editorScroll.scrollTop;
  const doc=view.state.doc;
  const totalLines=doc.lines;
  const seenStartLines=new Set<number>();
  const blocks=previewHost.querySelectorAll<HTMLElement>('[data-line]');
  for(const el of blocks){
   const startRaw=Number(el.dataset.line);
   if(!Number.isFinite(startRaw)||startRaw<0)continue;
   const elRect=el.getBoundingClientRect();
   if(elRect.height<=0)continue;
   const lineStart=Math.max(1,Math.min(totalLines,Math.floor(startRaw)+1));
   if(!seenStartLines.has(lineStart)){
    seenStartLines.add(lineStart);
    const blockStart=view.lineBlockAt(doc.line(lineStart).from);
    const eTop=editorDocOrigin+blockStart.top-VIEWPORT_ALIGN_PAD;
    const pTop=elRect.top-previewRect.top+previewScroll.scrollTop-VIEWPORT_ALIGN_PAD;
    pushAnchor(eTop,pTop);
   }
   if(elRect.height>80){
    const endRaw=Number(el.dataset.lineEnd??startRaw);
    const lineEnd=Math.max(lineStart,Math.min(totalLines,(Number.isFinite(endRaw)?Math.floor(endRaw):startRaw)+1));
    const blockEnd=view.lineBlockAt(doc.line(lineEnd).from);
    const eBot=editorDocOrigin+blockEnd.bottom-VIEWPORT_ALIGN_PAD;
    const pBot=elRect.bottom-previewRect.top+previewScroll.scrollTop-VIEWPORT_ALIGN_PAD;
    pushAnchor(eBot,pBot);
   }
  }
  const last=anchors[anchors.length-1];
  if(maxE>last.e||maxP>last.p){
   anchors.push({e:maxE,p:maxP});
  }
  return {anchors,maxE,maxP};
 };

 const mapPosition=(direction:'e2p'|'p2e',srcTop:number):number=>{
  const {anchors,maxE,maxP}=buildAnchors();
  const maxSrc=direction==='e2p'?maxE:maxP;
  const maxDst=direction==='e2p'?maxP:maxE;
  if(maxSrc<=0||maxDst<=0)return 0;
  if(srcTop<=0)return 0;
  if(srcTop>=maxSrc-0.5)return maxDst;
  for(let i=0;i<anchors.length-1;i++){
   const a=anchors[i],b=anchors[i+1];
   const srcA=direction==='e2p'?a.e:a.p;
   const srcB=direction==='e2p'?b.e:b.p;
   if(srcTop<=srcB||i===anchors.length-2){
    const dstA=direction==='e2p'?a.p:a.e;
    const dstB=direction==='e2p'?b.p:b.e;
    const span=srcB-srcA;
    if(span<=0.01)return dstA;
    const ratio=Math.max(0,Math.min(1,(srcTop-srcA)/span));
    return Math.max(0,Math.min(maxDst,dstA+ratio*(dstB-dstA)));
   }
  }
  return maxDst;
 };

 const syncFrom=(from:'editor'|'preview')=>{
  if(disposed||!options.isActive())return;
  const to=from==='editor'?'preview':'editor';
  const srcEl=from==='editor'?editorScroll:previewScroll;
  const dstEl=to==='editor'?editorScroll:previewScroll;
  const target=mapPosition(from==='editor'?'e2p':'p2e',srcEl.scrollTop);
  if(Math.abs(dstEl.scrollTop-target)<0.8)return;
  armLock(to);
  dstEl.scrollTop=target;
 };

 const onEditorScroll=()=>{
  if(activeLock==='editor')return;
  lastDriver='editor';
  syncFrom('editor');
 };

 const onPreviewScroll=()=>{
  if(activeLock==='preview')return;
  lastDriver='preview';
  options.onPreviewDrive?.();
  syncFrom('preview');
 };

 const onEditorIntent=()=>{
  lastDriver='editor';
  if(activeLock==='editor'){
   clearLock();
   activeLock=null;
  }
 };

 const onPreviewIntent=()=>{
  lastDriver='preview';
  if(activeLock==='preview'){
   clearLock();
   activeLock=null;
  }
 };

 const scheduleResync=()=>{
  if(disposed||!options.isActive())return;
  cancelAnimationFrame(resyncFrame);
  resyncFrame=requestAnimationFrame(()=>{
   if(!disposed&&options.isActive()){
    syncFrom(lastDriver);
   }
  });
 };

 editorScroll.addEventListener('scroll',onEditorScroll,{passive:true});
 previewScroll.addEventListener('scroll',onPreviewScroll,{passive:true});
 for(const ev of ['wheel','pointerdown','touchstart'] as const){
  editorScroll.addEventListener(ev,onEditorIntent,{passive:true,capture:true});
  previewScroll.addEventListener(ev,onPreviewIntent,{passive:true,capture:true});
 }
 const resizeObserver=new ResizeObserver(()=>scheduleResync());
 resizeObserver.observe(previewHost);
 const editorRoot=editorScroll.firstElementChild;
 if(editorRoot)resizeObserver.observe(editorRoot);
 window.addEventListener('resize',scheduleResync,{passive:true});

 return {
  syncNow(from){
   if(from)lastDriver=from;
   syncFrom(lastDriver);
  },
  notifyLayoutChange(){
   scheduleResync();
  },
  dispose(){
   disposed=true;
   clearLock();
   cancelAnimationFrame(resyncFrame);
   resizeObserver.disconnect();
   editorScroll.removeEventListener('scroll',onEditorScroll);
   previewScroll.removeEventListener('scroll',onPreviewScroll);
   for(const ev of ['wheel','pointerdown','touchstart'] as const){
    editorScroll.removeEventListener(ev,onEditorIntent,{capture:true});
    previewScroll.removeEventListener(ev,onPreviewIntent,{capture:true});
   }
   window.removeEventListener('resize',scheduleResync);
  },
 };
}
