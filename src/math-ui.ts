import {WidgetType,EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';
import {Annotation,StateEffect,StateField,type EditorState,type Extension} from '@codemirror/state';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {isolateHistory} from '@codemirror/commands';
import type {SyntaxNode} from '@lezer/common';
import {fillMath} from './math';

const pending=new WeakMap<HTMLElement,ReturnType<typeof setTimeout>>();

const mathWidgetAnnotation=Annotation.define<boolean>();
const openInlineMathEffect=StateEffect.define<{from:number;caret:'start'|'end'|'keep'}|null>();
export const openBlockMathEffect=StateEffect.define<number|null>();

export const activeBlockMath=StateField.define<number|null>({
 create:()=>null,
 update(value,tr){
  for(const e of tr.effects){
   if(e.is(openBlockMathEffect))return e.value;
  }
  if(value===null)return null;
  if(tr.docChanged)value=tr.changes.mapPos(value,1);
  if(tr.selection){
   const sel=tr.state.selection.main;
   if(!sel.empty)return null;
  }
  return value;
 },
});

interface InlineMathInfo {from:number;to:number;source:string}

function inlineMathAt(state:EditorState,pos:number):InlineMathInfo|null{
 const tree=ensureSyntaxTree(state,Math.min(state.doc.length,pos+1),100)||syntaxTree(state);
 for(const bias of [1,-1] as const){
  for(let n:SyntaxNode|null=tree.resolveInner(pos,bias);n;n=n.parent){
   if(n.name==='InlineMath'){
    if(n.to-n.from>=2){
     return {from:n.from,to:n.to,source:state.sliceDoc(n.from+1,n.to-1)};
    }
   }
  }
 }
 return null;
}

function isInsideNode(pos:number,from:number,to:number){
 return pos>from&&pos<to;
}

// Wrap a TeX body back into the same block container style (`$$...$$` or ```math).
function formatBlockMathReplacement(original:string,source:string):string{
 const trimmed=original.trimEnd();
 if(/^(`{3,}|~{3,})[ \t]*math/.test(trimmed)){
  const openLine=trimmed.split('\n')[0];
  const fence=/^(`{3,}|~{3,})/.exec(openLine)![1];
  const body=source.replace(/^\n+|\n+$/g,'');
  return `${openLine}\n${body}\n${fence}`;
 }
 const body=source.replace(/^\n+|\n+$/g,'');
 return body.includes('\n')?`$$\n${body}\n$$`:`$$${body}$$`;
}

export class MathWidget extends WidgetType{
 constructor(
  readonly source:string,
  readonly display:boolean,
  readonly from:number,
  readonly composing:StateField<boolean>,
  readonly to=from+source.length+(display?4:2),
  readonly editing=false,
 ){super()}

 eq(other:MathWidget){
  return other.source===this.source&&other.display===this.display&&other.from===this.from&&other.to===this.to&&other.editing===this.editing;
 }

 private renderInto(dom:HTMLElement,view:EditorView){
  dom.dataset.mathFrom=String(this.from);
  dom.dataset.mathTo=String(this.to);
  dom.classList.toggle('is-editing',this.editing);
  dom.classList.toggle('is-empty',!this.source.trim());
  const blocked=()=>view.composing||view.state.field(this.composing);
  const paint=()=>{
   if(!this.source.trim()){
    dom.replaceChildren();
    const ph=document.createElement('span');
    ph.className='math-placeholder';
    ph.textContent='∑';
    dom.append(ph);
    return;
   }
   fillMath(dom,this.source,this.display);
  };
  if(!blocked())paint();
  else{
   dom.textContent=this.source;
   const resume=()=>{
    pending.delete(dom);
    if(!dom.isConnected)return;
    if(blocked()){pending.set(dom,setTimeout(resume,50));return}
    paint();
    view.requestMeasure();
   };
   pending.set(dom,setTimeout(resume,50));
  }
 }

 toDOM(view:EditorView){
  const dom=document.createElement(this.display?'div':'span');
  dom.className='rendered-math '+(this.display?'math-display':'math-inline');
  dom.contentEditable='false';
  this.renderInto(dom,view);
  dom.addEventListener('mousedown',event=>{
   if(view.composing||view.state.field(this.composing)||view.state.readOnly)return;
   event.preventDefault();
   event.stopPropagation();
   const curFrom=Number(dom.dataset.mathFrom??this.from);
   if(this.display){
    view.dispatch({
     selection:{anchor:curFrom+2},
     effects:openBlockMathEffect.of(curFrom),
     scrollIntoView:true,
    });
    return;
   }
   view.dispatch({
    selection:{anchor:curFrom+1},
    effects:openInlineMathEffect.of({from:curFrom,caret:'end'}),
    scrollIntoView:true,
   });
  });
  return dom;
 }

 updateDOM(dom:HTMLElement,view:EditorView){
  clearTimeout(pending.get(dom));
  pending.delete(dom);
  this.renderInto(dom,view);
  return true;
 }

 destroy(dom:HTMLElement){
  clearTimeout(pending.get(dom));
  pending.delete(dom);
 }

 ignoreEvent(){return true}
}

interface CardHandles {
 view:EditorView;
 preview:HTMLDivElement;
 textarea:HTMLTextAreaElement;
 from:number;
 to:number;
 raw:string;
 source:string;
 enterBlankStreak:boolean;
}

const mathCards=new WeakMap<HTMLElement,CardHandles>();

function resizeTextarea(ta:HTMLTextAreaElement){
 ta.style.height='0px';
 ta.style.height=Math.max(42,Math.min(260,ta.scrollHeight))+'px';
}

function renderCardPreview(preview:HTMLElement,source:string){
 const trimmed=source.trim();
 if(!trimmed){
  preview.replaceChildren();
  const empty=document.createElement('span');
  empty.className='rs-math-card-empty';
  empty.textContent='输入 TeX 公式…';
  preview.append(empty);
  return;
 }
 fillMath(preview,trimmed,true);
}

export class MathBlockCardWidget extends WidgetType{
 constructor(
  readonly source:string,
  readonly raw:string,
  readonly from:number,
  readonly to:number,
 ){super()}

 eq(other:MathBlockCardWidget){
  return other.from===this.from&&other.to===this.to&&other.source===this.source&&other.raw===this.raw;
 }

 toDOM(view:EditorView){
  const root=document.createElement('div');
  root.className='rs-math-card';
  root.contentEditable='false';

  const preview=document.createElement('div');
  preview.className='rs-math-card-preview math-display';

  const sourceWrap=document.createElement('div');
  sourceWrap.className='rs-math-card-source';

  const badge=document.createElement('span');
  badge.className='rs-math-card-lang';
  badge.textContent='TeX';

  const textarea=document.createElement('textarea');
  textarea.className='rs-math-card-input';
  textarea.spellcheck=false;
  textarea.autocomplete='off';
  textarea.rows=1;
  textarea.value=this.source;
  textarea.setAttribute('aria-label','块级公式源码');

  const hint=document.createElement('div');
  hint.className='rs-math-card-hint';
  hint.textContent='Tab 退出 · 连按两次回车接续正文 · Esc 收起';

  sourceWrap.append(badge,textarea,hint);
  root.append(preview,sourceWrap);

  const handles:CardHandles={
   view,preview,textarea,
   from:this.from,to:this.to,
   raw:this.raw,source:this.source,
   enterBlankStreak:false,
  };
  mathCards.set(root,handles);
  renderCardPreview(preview,this.source);

  const commitValue=(nextSource:string)=>{
   const h=mathCards.get(root);
   if(!h)return;
   h.source=nextSource;
   renderCardPreview(h.preview,nextSource);
   resizeTextarea(h.textarea);
   const nextRaw=formatBlockMathReplacement(h.raw,nextSource);
   if(nextRaw===h.raw)return;
   const oldRawLen=h.raw.length;
   h.raw=nextRaw;
   h.to=h.from+nextRaw.length;
   h.view.dispatch({
    changes:{from:h.from,to:h.from+oldRawLen,insert:nextRaw},
    selection:{anchor:h.from+Math.min(2,nextRaw.length)},
    annotations:[mathWidgetAnnotation.of(true)],
    userEvent:'input.math',
   });
  };

  const exitCard=(appendParagraph:boolean)=>{
   const h=mathCards.get(root);
   if(!h)return;
   const doc=h.view.state.doc;
   const afterPos=Math.min(doc.length,h.to);
   if(appendParagraph){
    const rest=doc.sliceString(afterPos,Math.min(doc.length,afterPos+2));
    if(afterPos===doc.length){
     h.view.dispatch({
      changes:{from:afterPos,to:afterPos,insert:'\n\n'},
      selection:{anchor:afterPos+2},
      effects:openBlockMathEffect.of(null),
      annotations:[isolateHistory.of('full')],
      scrollIntoView:true,
     });
    }else if(!rest.startsWith('\n\n')){
     const lineEnd=doc.lineAt(afterPos).to;
     const need=rest.startsWith('\n')?'\n':'\n\n';
     h.view.dispatch({
      changes:{from:lineEnd,to:lineEnd,insert:need},
      selection:{anchor:lineEnd+need.length},
      effects:openBlockMathEffect.of(null),
      scrollIntoView:true,
     });
    }else{
     h.view.dispatch({
      selection:{anchor:afterPos+2},
      effects:openBlockMathEffect.of(null),
      scrollIntoView:true,
     });
    }
   }else{
    h.view.dispatch({
     selection:{anchor:afterPos},
     effects:openBlockMathEffect.of(null),
     scrollIntoView:true,
    });
   }
   h.view.focus();
  };

  textarea.addEventListener('mousedown',e=>e.stopPropagation());
  textarea.addEventListener('input',()=>{
   handles.enterBlankStreak=false;
   commitValue(textarea.value);
  });

  textarea.addEventListener('keydown',e=>{
   e.stopPropagation();
   if(e.isComposing)return;
   if(e.key==='Tab'){
    e.preventDefault();
    exitCard(true);
    return;
   }
   if(e.key==='Escape'){
    e.preventDefault();
    exitCard(false);
    return;
   }
   if(e.key==='Enter'&&!e.shiftKey){
    const val=textarea.value;
    const atEnd=textarea.selectionStart===val.length&&textarea.selectionEnd===val.length;
    const lastLine=val.split('\n').at(-1)||'';
    if(atEnd&&lastLine===''&&(handles.enterBlankStreak||val.endsWith('\n'))){
     e.preventDefault();
     const trimmedVal=val.replace(/\n+$/,'');
     if(trimmedVal!==val){
      textarea.value=trimmedVal;
      commitValue(trimmedVal);
     }
     exitCard(true);
     return;
    }
    if(atEnd&&lastLine===''){
     handles.enterBlankStreak=true;
    }else{
     handles.enterBlankStreak=false;
    }
   }else{
    handles.enterBlankStreak=false;
   }
   if(e.key==='Backspace'&&textarea.value===''){
    e.preventDefault();
    const h=mathCards.get(root);
    if(!h)return;
    const line=h.view.state.doc.lineAt(h.from);
    const removeFrom=line.from;
    const removeTo=Math.min(h.view.state.doc.length,h.to+(h.view.state.doc.sliceString(h.to,h.to+1)==='\n'?1:0));
    h.view.dispatch({
     changes:{from:removeFrom,to:removeTo,insert:''},
     selection:{anchor:removeFrom},
     effects:openBlockMathEffect.of(null),
     annotations:[isolateHistory.of('full')],
    });
    h.view.focus();
    return;
   }
   if(e.key==='ArrowUp'&&textarea.selectionStart===0&&textarea.selectionEnd===0){
    const h=mathCards.get(root);
    if(h&&h.from>0){
     e.preventDefault();
     const prevLine=h.view.state.doc.lineAt(Math.max(0,h.from-1));
     h.view.dispatch({selection:{anchor:prevLine.to},effects:openBlockMathEffect.of(null),scrollIntoView:true});
     h.view.focus();
    }
   }
   if(e.key==='ArrowDown'&&textarea.selectionStart===textarea.value.length){
    const h=mathCards.get(root);
    if(h){
     e.preventDefault();
     exitCard(false);
    }
   }
  });

  // Clicking outside the card closes edit mode naturally when editor receives selection or pointerdown.
  preview.addEventListener('mousedown',e=>{
   e.preventDefault();
   textarea.focus();
  });

  requestAnimationFrame(()=>{
   if(!root.isConnected)return;
   resizeTextarea(textarea);
   if(document.activeElement!==textarea){
    textarea.focus({preventScroll:true});
    textarea.setSelectionRange(textarea.value.length,textarea.value.length);
   }
  });
  return root;
 }

 updateDOM(dom:HTMLElement,view:EditorView){
  const h=mathCards.get(dom);
  if(!h)return false;
  h.view=view;
  h.from=this.from;
  h.to=this.to;
  h.raw=this.raw;
  if(h.source!==this.source){
   h.source=this.source;
   renderCardPreview(h.preview,this.source);
   if(document.activeElement!==h.textarea||h.textarea.value!==this.source){
    const start=h.textarea.selectionStart,end=h.textarea.selectionEnd;
    h.textarea.value=this.source;
    resizeTextarea(h.textarea);
    if(document.activeElement===h.textarea){
     const len=h.textarea.value.length;
     h.textarea.setSelectionRange(Math.min(start,len),Math.min(end,len));
    }
   }
  }
  return true;
 }

 destroy(dom:HTMLElement){
  mathCards.delete(dom);
 }

 ignoreEvent(){return true}
}

class InlineMathPopoverPlugin{
 private pop:HTMLDivElement;
 private input:HTMLInputElement;
 private activeFrom=-1;
 private activeTo=-1;
 private currentSource='';
 private emptyCleared=false;
 private destroyed=false;
 private repositioning=false;
 private scroller:HTMLElement|null;
 private abort=new AbortController();

 constructor(readonly view:EditorView){
  this.pop=document.createElement('div');
  this.pop.className='rs-inline-math-popover';
  this.pop.hidden=true;
  this.pop.setAttribute('role','dialog');
  this.pop.setAttribute('aria-label','行内公式源码');

  const leftDollar=document.createElement('span');
  leftDollar.className='rs-math-pop-fence';
  leftDollar.textContent='$';

  this.input=document.createElement('input');
  this.input.type='text';
  this.input.className='rs-math-pop-input';
  this.input.spellcheck=false;
  this.input.autocomplete='off';
  this.input.setAttribute('aria-label','TeX 公式内容');

  const rightDollar=document.createElement('span');
  rightDollar.className='rs-math-pop-fence';
  rightDollar.textContent='$';

  const tabHint=document.createElement('span');
  tabHint.className='rs-math-pop-hint';
  tabHint.textContent='Tab 跳出';

  this.pop.append(leftDollar,this.input,rightDollar,tabHint);
  view.dom.append(this.pop);

  this.scroller=view.dom.closest<HTMLElement>('.editor-scroll');
  const signal=this.abort.signal;

  this.pop.addEventListener('mousedown',e=>e.stopPropagation(),{signal});
  this.input.addEventListener('input',()=>this.handleInput(),{signal});
  this.input.addEventListener('keydown',e=>this.handleKeydown(e),{signal});
  this.input.addEventListener('blur',()=>{
   requestAnimationFrame(()=>{
    if(this.destroyed)return;
    if(document.activeElement!==this.input&&!this.view.hasFocus){
     this.closePopover();
    }
   });
  },{signal});

  this.scroller?.addEventListener('scroll',()=>{
   if(!this.pop.hidden)this.queuePosition();
  },{passive:true,signal});
  window.addEventListener('resize',()=>{
   if(!this.pop.hidden)this.queuePosition();
  },{passive:true,signal});

  this.syncFromState(this.view.state,null,false);
 }

 update(u:ViewUpdate){
  let explicit: {from:number;caret:'start'|'end'|'keep'}|null=null;
  let fromPopover=false;
  for(const tr of u.transactions){
   if(tr.annotation(mathWidgetAnnotation))fromPopover=true;
   for(const e of tr.effects){
    if(e.is(openInlineMathEffect))explicit=e.value;
   }
  }
  if(explicit===null&&(u.docChanged||u.selectionSet||u.viewportChanged||u.geometryChanged||u.focusChanged)){
   this.syncFromState(u.state,explicit,fromPopover);
  }else if(explicit!==null){
   this.syncFromState(u.state,explicit,fromPopover);
  }
 }

 private syncFromState(state:EditorState,explicit:{from:number;caret:'start'|'end'|'keep'}|null,fromPopover:boolean){
  if(state.readOnly||this.view.dom.closest('.read-layout')){
   this.closePopover();
   return;
  }
  const sel=state.selection.main;
  if(!sel.empty){
   this.closePopover();
   return;
  }
  if(this.emptyCleared&&fromPopover)return;

  const info=explicit
   ?inlineMathAt(state,Math.min(state.doc.length,explicit.from+1))
   :inlineMathAt(state,sel.head);

  const shouldOpen=info&&(explicit!==null||isInsideNode(sel.head,info.from,info.to));
  if(!shouldOpen||!info){
   if(!this.emptyCleared||document.activeElement!==this.input){
    this.closePopover();
   }
   return;
  }

  const openingNew=this.pop.hidden||this.activeFrom!==info.from;
  this.activeFrom=info.from;
  this.activeTo=info.to;
  this.emptyCleared=false;

  if(!fromPopover){
   this.currentSource=info.source;
   if(this.input.value!==info.source){
    this.input.value=info.source;
    this.resizeInput();
   }
  }

  this.pop.hidden=false;
  this.queuePosition();

  if(explicit||openingNew){
   const targetOffset=explicit?.caret==='start'
    ?0
    :explicit?.caret==='end'
     ?info.source.length
     :Math.max(0,Math.min(info.source.length,sel.head-(info.from+1)));
   requestAnimationFrame(()=>{
    if(this.destroyed||this.pop.hidden)return;
    if(document.activeElement!==this.input)this.input.focus({preventScroll:true});
    this.input.setSelectionRange(targetOffset,targetOffset);
   });
  }
 }

 private resizeInput(){
  const len=Math.max(4,this.input.value.length+1);
  this.input.style.width=`${Math.min(42,len)}ch`;
 }

 private handleInput(){
  this.resizeInput();
  const val=this.input.value;
  if(this.activeFrom<0)return;
  if(!val){
   // Keep an unobtrusive placeholder token until the user resumes typing or deletes the pair cleanly.
   this.emptyCleared=true;
   this.currentSource='';
   this.view.dispatch({
    changes:{from:this.activeFrom,to:this.activeTo,insert:'$$'},
    selection:{anchor:this.activeFrom+1},
    annotations:[mathWidgetAnnotation.of(true)],
    userEvent:'input.math',
   });
   this.activeTo=this.activeFrom+2;
   this.queuePosition();
   return;
  }
  const nextRaw=`$${val}$`;
  const wasEmpty=this.emptyCleared;
  this.emptyCleared=false;
  this.currentSource=val;
  const oldTo=this.activeTo;
  this.view.dispatch({
   changes:{from:this.activeFrom,to:oldTo,insert:nextRaw},
   selection:{anchor:this.activeFrom+1+Math.min(this.input.selectionStart??val.length,val.length)},
   annotations:[mathWidgetAnnotation.of(true)],
   userEvent:'input.math',
  });
  this.activeTo=this.activeFrom+nextRaw.length;
  if(wasEmpty)this.queuePosition();
 }

 private handleKeydown(e:KeyboardEvent){
  e.stopPropagation();
  if(e.isComposing)return;
  if(e.key==='Tab'||e.key==='Enter'||e.key==='Escape'){
   e.preventDefault();
   const exitTo=this.activeTo>=0?Math.min(this.view.state.doc.length,this.activeTo):this.view.state.selection.main.head;
   if(this.emptyCleared&&this.activeFrom>=0){
    this.view.dispatch({
     changes:{from:this.activeFrom,to:this.activeTo,insert:''},
     selection:{anchor:this.activeFrom},
     annotations:[isolateHistory.of('full')],
    });
   }else{
    this.view.dispatch({
     selection:{anchor:exitTo},
     effects:openInlineMathEffect.of(null),
     scrollIntoView:true,
    });
   }
   this.closePopover();
   this.view.focus();
   return;
  }
  if(e.key==='Backspace'&&this.input.value===''){
   e.preventDefault();
   if(this.activeFrom>=0){
    this.view.dispatch({
     changes:{from:this.activeFrom,to:this.activeTo,insert:''},
     selection:{anchor:this.activeFrom},
     annotations:[isolateHistory.of('full')],
    });
   }
   this.closePopover();
   this.view.focus();
   return;
  }
  if(e.key==='ArrowLeft'&&this.input.selectionStart===0&&this.input.selectionEnd===0){
   e.preventDefault();
   const exitFrom=Math.max(0,this.activeFrom);
   this.closePopover();
   this.view.dispatch({selection:{anchor:exitFrom},effects:openInlineMathEffect.of(null),scrollIntoView:true});
   this.view.focus();
   return;
  }
  if(e.key==='ArrowRight'&&this.input.selectionStart===this.input.value.length&&this.input.selectionEnd===this.input.value.length){
   e.preventDefault();
   const exitTo=Math.min(this.view.state.doc.length,this.activeTo);
   this.closePopover();
   this.view.dispatch({selection:{anchor:exitTo},effects:openInlineMathEffect.of(null),scrollIntoView:true});
   this.view.focus();
  }
 }

 private queuePosition(){
  if(this.destroyed||this.repositioning||this.pop.hidden)return;
  this.repositioning=true;
  requestAnimationFrame(()=>{
   this.repositioning=false;
   if(this.destroyed||this.pop.hidden||this.activeFrom<0)return;
   const anchor=this.view.dom.querySelector<HTMLElement>(`.rendered-math.math-inline[data-math-from="${this.activeFrom}"]`);
   let left=0,bottom=0,top=0;
   const hostRect=this.view.dom.getBoundingClientRect();
   if(anchor){
    const r=anchor.getBoundingClientRect();
    left=(r.left+r.right)/2-hostRect.left;
    bottom=r.bottom-hostRect.top+6;
    top=r.top-hostRect.top-6;
   }else{
    const c=this.view.coordsAtPos(Math.min(this.view.state.doc.length,this.activeFrom+1),1);
    if(!c)return;
    left=c.left-hostRect.left;
    bottom=c.bottom-hostRect.top+6;
    top=c.top-hostRect.top-6;
   }
   const popW=this.pop.offsetWidth||180;
   const popH=this.pop.offsetHeight||34;
   const maxLeft=Math.max(popW/2+8,hostRect.width-popW/2-8);
   const clampedLeft=Math.max(popW/2+8,Math.min(maxLeft,left));
   const scrollerRect=this.scroller?.getBoundingClientRect()??hostRect;
   const absoluteBottom=hostRect.top+bottom+popH;
   const placeAbove=absoluteBottom>scrollerRect.bottom-12&&hostRect.top+top-popH>scrollerRect.top+8;
   this.pop.style.left=`${clampedLeft.toFixed(1)}px`;
   this.pop.style.top=`${(placeAbove?top-popH:bottom).toFixed(1)}px`;
  });
 }

 private closePopover(){
  this.pop.hidden=true;
  this.activeFrom=-1;
  this.activeTo=-1;
  this.emptyCleared=false;
 }

 destroy(){
  this.destroyed=true;
  this.abort.abort();
  this.pop.remove();
 }
}

export function createInlineMathPopover():Extension{
 return [activeBlockMath,ViewPlugin.fromClass(InlineMathPopoverPlugin)];
}
