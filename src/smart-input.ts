import {
 Annotation,
 EditorState,
 Prec,
 RangeSetBuilder,
 StateEffect,
 StateField,
 type Extension,
} from '@codemirror/state';
import {
 Decoration,
 EditorView,
 WidgetType,
 keymap,
 type DecorationSet,
} from '@codemirror/view';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {isolateHistory} from '@codemirror/commands';
import type {SyntaxNode} from '@lezer/common';
import {frontMatterRange,serializeTable,splitCells} from './editing';
import {focusTableCell} from './table-ui';
import {openBlockMathEffect} from './math-ui';

interface PairEntry {
 from:number;
 to:number;
 open:string;
 close:string;
}

interface SmartRollback {
 pos:number;
 from:number;
 insertLen:number;
 literal:string;
}

const ASCII_PAIRS:Record<string,string>={
 '(':')',
 '[':']',
 '{':'}',
 '"':'"',
 "'":"'",
 '$':'$',
};

const CJK_OPEN_PAIRS:Record<string,string>={
 '「':'」',
 '『':'』',
 '（':'）',
 '【':'】',
 '《':'》',
 '“':'”',
 '‘':'’',
};

const WRAP_PAIRS:Record<string,[string,string]>={
 '(' :['(',')'],
 '[' :['[',']'],
 '{' :['{','}'],
 '"' :['"','"'],
 "'" :["'","'"],
 '$' :['$','$'],
 '*' :['*','*'],
 '~' :['~~','~~'],
 '`' :['`','`'],
 '=' :['==','=='],
 '「':['「','」'],
 '『':['『','』'],
 '（':['（','）'],
 '【':['【','】'],
 '《':['《','》'],
 '“':['“','”'],
 '‘':['‘','’'],
};

const LITERAL_BLOCK=/^(FencedCode|CodeBlock|MathBlock|MathFence|MermaidFence|HTMLBlock)$/;
const CODE_OR_MATH=/^(FencedCode|CodeBlock|MathBlock|MathFence|MermaidFence|HTMLBlock|InlineCode|InlineMath|URL|HTMLTag)$/;

const smartInputAnnotation=Annotation.define<boolean>();
const pushPairEffect=StateEffect.define<PairEntry>();
const popPairEffect=StateEffect.define<number>();
const clearPairsEffect=StateEffect.define<null>();
const setRollbackEffect=StateEffect.define<SmartRollback|null>();

class TabBadgeWidget extends WidgetType{
 constructor(readonly closeChar:string){super()}
 eq(other:TabBadgeWidget){return other.closeChar===this.closeChar}
 toDOM(){
  const badge=document.createElement('span');
  badge.className='rs-autopair-tab-badge';
  badge.setAttribute('aria-hidden','true');
  badge.textContent='Tab ↦';
  return badge;
 }
 ignoreEvent(){return true}
}

function inSyntax(state:EditorState,pos:number,pattern:RegExp):boolean{
 const meta=frontMatterRange(state);
 if(meta&&pos<=meta.to)return true;
 const clamped=Math.max(0,Math.min(state.doc.length,pos));
 const tree=ensureSyntaxTree(state,Math.min(state.doc.length,clamped+8),80)||syntaxTree(state);
 for(const bias of [-1,1] as const){
  for(let n:SyntaxNode|null=tree.resolveInner(clamped,bias);n;n=n.parent){
   if(pattern.test(n.name))return true;
  }
 }
 return false;
}

function isHan(ch:string):boolean{
 return /\p{Script=Han}/u.test(ch);
}

function isAsciiAlnum(ch:string):boolean{
 return ch.length===1&&((ch>='a'&&ch<='z')||(ch>='A'&&ch<='Z')||(ch>='0'&&ch<='9'));
}

function needAutoSpace(left:string,right:string):boolean{
 if(!left||!right)return false;
 return (isHan(left)&&isAsciiAlnum(right))||(isAsciiAlnum(left)&&isHan(right));
}

function activeTopPair(state:EditorState,pairs:PairEntry[]):PairEntry|null{
 const sel=state.selection.main;
 if(!sel.empty||!pairs.length)return null;
 for(let i=pairs.length-1;i>=0;i--){
  const p=pairs[i];
  const innerFrom=p.from+p.open.length;
  if(sel.head>=innerFrom&&sel.head<=p.to){
   if(state.sliceDoc(p.from,innerFrom)===p.open&&state.sliceDoc(p.to,p.to+p.close.length)===p.close){
    return p;
   }
  }
 }
 return null;
}

function closerMatches(expected:string,typed:string):boolean{
 if(expected===typed)return true;
 return (expected==='”'&&typed==='"')||(expected==='’'&&typed==="'");
}

function pairRangeValid(state:EditorState,p:PairEntry):boolean{
 const innerFrom=p.from+p.open.length;
 const outerTo=p.to+p.close.length;
 if(p.from<0||outerTo>state.doc.length||innerFrom>p.to)return false;
 return state.sliceDoc(p.from,innerFrom)===p.open&&state.sliceDoc(p.to,outerTo)===p.close;
}

const autoPairField=StateField.define<PairEntry[]>({
 create:()=>[],
 update(pairs,tr){
  let next=pairs;
  if(tr.docChanged){
   next=next.map(p=>({
    ...p,
    from:tr.changes.mapPos(p.from,1),
    to:tr.changes.mapPos(p.to,1),
   }));
  }
  for(const e of tr.effects){
   if(e.is(clearPairsEffect))return [];
   if(e.is(pushPairEffect))next=[...next,e.value];
   if(e.is(popPairEffect))next=next.slice(0,-e.value);
  }
  const sel=tr.state.selection.main;
  if(!sel.empty)return [];
  return next.filter(p=>pairRangeValid(tr.state,p)&&sel.head>=p.from+p.open.length&&sel.head<=p.to);
 },
});

const autoPairDecorations=EditorView.decorations.compute([autoPairField,'selection'],state=>{
 if(state.readOnly)return Decoration.none;
 const pairs=state.field(autoPairField);
 const top=activeTopPair(state,pairs);
 if(!top)return Decoration.none;
 // Do not draw pair highlight on top of InlineMath once KaTeX widget takes over.
 if(top.open==='$'&&inSyntax(state,top.from+1,/^(InlineMath|MathBlock)$/))return Decoration.none;
 const outerTo=top.to+top.close.length;
 const builder=new RangeSetBuilder<Decoration>();
 builder.add(top.from,outerTo,Decoration.mark({class:'rs-autopair-span'}));
 builder.add(outerTo,outerTo,Decoration.widget({widget:new TabBadgeWidget(top.close),side:1}));
 return builder.finish();
});

const rollbackField=StateField.define<SmartRollback|null>({
 create:()=>null,
 update(value,tr){
  for(const e of tr.effects){
   if(e.is(setRollbackEffect))return e.value;
  }
  if(!value)return null;
  if(tr.docChanged||tr.selection)return null;
  return value;
 },
});

function parseQuickTableLine(lineText:string):{prefix:string;cells:string[]}|null{
 const m=/^([ \t]*(?:>\s*)?)(.+)$/.exec(lineText);
 if(!m)return null;
 const prefix=m[1],rest=m[2].trim();
 if(!rest.startsWith('|'))return null;
 // Require at least two pipes so a plain "| word" quote-like prefix isn't hijacked as a table.
 let pipes=0;
 for(let i=0;i<rest.length;i++){
  if(rest[i]==='|'&&(i===0||rest[i-1]!=='\\'))pipes++;
 }
 if(pipes<2)return null;
 if(/^[|\s:-]+$/.test(rest))return null;
 const cells=splitCells(rest);
 if(!cells.length||cells.every(c=>!c))return null;
 return {prefix,cells};
}

function tryEnterTable(view:EditorView,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 const sel=state.selection.main;
 if(!sel.empty)return false;
 const line=state.doc.lineAt(sel.head);
 if(sel.head<line.from||sel.head>line.to)return false;
 if(inSyntax(state,line.from,/^(FencedCode|CodeBlock|MathBlock|MathFence|MermaidFence|HTMLBlock|Table)$/))return false;
 // Avoid expanding if the next line is already a GFM table delimiter row.
 if(line.number<state.doc.lines){
  const nextText=state.doc.line(line.number+1).text.trim();
  if(/^\|?[\s:-]+\|/.test(nextText))return false;
 }
 const parsed=parseQuickTableLine(line.text);
 if(!parsed)return false;
 const emptyRow=Array(parsed.cells.length).fill('');
 const tableText=serializeTable([parsed.cells,emptyRow],[],parsed.prefix);
 const afterTail=line.to<state.doc.length?'\n':'\n';
 const trailing=line.to===state.doc.length?afterTail:'';
 view.dispatch({
  changes:{from:line.from,to:line.to,insert:tableText+trailing},
  selection:{anchor:line.from+2},
  effects:clearPairsEffect.of(null),
  userEvent:'input.table',
  annotations:isolateHistory.of('full'),
  scrollIntoView:true,
 });
 requestAnimationFrame(()=>{
  if(view.dom.isConnected){
   focusTableCell(view,line.from,1,0);
  }
 });
 return true;
}

function tryTabOutPair(view:EditorView,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 const top=activeTopPair(state,state.field(autoPairField));
 if(!top)return false;
 view.dispatch({
  selection:{anchor:top.to+top.close.length},
  effects:popPairEffect.of(1),
  scrollIntoView:true,
 });
 return true;
}

function hiddenBlockPrefixLen(state:EditorState,lineFrom:number,lineText:string):number{
 if(!lineText||inSyntax(state,lineFrom,LITERAL_BLOCK))return 0;
 const h=/^[ \t]*#{1,6}[ \t]+/.exec(lineText);
 if(h)return h[0].length;
 const b=/^[ \t]*(?:(?:>[ \t]*)+(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?|(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/.exec(lineText);
 if(b&&b[0].trim())return b[0].length;
 return 0;
}

function tryExitEmptyQuote(view:EditorView,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 const sel=state.selection.main;
 if(!sel.empty||state.selection.ranges.length!==1)return false;
 if(inSyntax(state,sel.head,LITERAL_BLOCK))return false;
 const line=state.doc.lineAt(sel.head);
 const m=/^([ \t]*)((?:>[ \t]*)+)$/.exec(line.text);
 if(!m||sel.head<line.from)return false;
 const quoteCount=(m[2].match(/>/g)||[]).length;
 if(quoteCount<=0)return false;
 const nextPrefix=quoteCount>1?m[1]+'> '.repeat(quoteCount-1):m[1];
 view.dispatch({
  changes:{from:line.from,to:line.to,insert:nextPrefix},
  selection:{anchor:line.from+nextPrefix.length},
  userEvent:'delete.backward',
  annotations:isolateHistory.of('full'),
  scrollIntoView:true,
 });
 return true;
}

function trySmartHome(view:EditorView,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 const sel=state.selection.main;
 if(!sel.empty||state.selection.ranges.length!==1)return false;
 const line=state.doc.lineAt(sel.head);
 const pLen=hiddenBlockPrefixLen(state,line.from,line.text);
 if(pLen<=0)return false;
 const bodyStart=line.from+pLen;
 view.dispatch({selection:{anchor:bodyStart},userEvent:'select',scrollIntoView:true});
 return true;
}

function trySmartArrowLeft(view:EditorView,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 const sel=state.selection.main;
 if(!sel.empty||state.selection.ranges.length!==1)return false;
 const line=state.doc.lineAt(sel.head);
 const pLen=hiddenBlockPrefixLen(state,line.from,line.text);
 if(pLen<=0)return false;
 const bodyStart=line.from+pLen;
 if(sel.head<=bodyStart){
  if(line.number>1){
   const prev=state.doc.line(line.number-1);
   view.dispatch({selection:{anchor:prev.to},userEvent:'select',scrollIntoView:true});
  }else if(sel.head<bodyStart){
   view.dispatch({selection:{anchor:bodyStart},userEvent:'select',scrollIntoView:true});
  }
  return true;
 }
 return false;
}

function trySmartBackspace(view:EditorView,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 const sel=state.selection.main;
 if(!sel.empty)return false;

 // 1. Immediate rollback for smart punctuation (-- -> —, ... -> …, --- -> divider).
 const rb=state.field(rollbackField);
 if(rb&&sel.head===rb.pos&&rb.from+rb.insertLen<=state.doc.length){
  view.dispatch({
   changes:{from:rb.from,to:rb.from+rb.insertLen,insert:rb.literal},
   selection:{anchor:rb.from+rb.literal.length},
   effects:setRollbackEffect.of(null),
   userEvent:'delete.backward',
   annotations:isolateHistory.of('full'),
  });
  return true;
 }

 // 2. Empty auto-pair symmetric deletion, e.g. (|) -> |.
 const top=activeTopPair(state,state.field(autoPairField));
 if(top&&sel.head===top.from+top.open.length&&sel.head===top.to){
  view.dispatch({
   changes:{from:top.from,to:top.to+top.close.length,insert:''},
   selection:{anchor:top.from},
   effects:popPairEffect.of(1),
   userEvent:'delete.backward',
  });
  return true;
 }

 // 3. Unwrap block prefix (heading `# `, empty quote `> `, empty list `- ` / `- [ ] `) when pressing Backspace at its right edge.
 const line=state.doc.lineAt(sel.head);
 const beforeCaret=state.sliceDoc(line.from,sel.head);
 const hMatch=/^([ \t]*)#{1,6}[ \t]+$/.exec(beforeCaret);
 if(hMatch){
  view.dispatch({
   changes:{from:line.from+hMatch[1].length,to:sel.head,insert:''},
   selection:{anchor:line.from+hMatch[1].length},
   userEvent:'delete.backward',
   annotations:isolateHistory.of('full'),
  });
  return true;
 }
 const emptyPrefix=/^([ \t]*)(?:>[ \t]*|[-+*][ \t]+(?:\[[ xX]\][ \t]*)?|\d+[.)][ \t]+)$/.exec(beforeCaret);
 if(emptyPrefix&&sel.head===line.to){
  view.dispatch({
   changes:{from:line.from+emptyPrefix[1].length,to:line.to,insert:''},
   selection:{anchor:line.from+emptyPrefix[1].length},
   userEvent:'delete.backward',
   annotations:isolateHistory.of('full'),
  });
  return true;
 }
 return false;
}

function handleSmartInput(view:EditorView,from:number,to:number,text:string,composing:StateField<boolean>):boolean{
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return false;
 if(text.length!==1)return false;

 // Wrap non-empty selection on opener press.
 if(from<to){
  const pair=WRAP_PAIRS[text];
  if(!pair)return false;
  if(inSyntax(state,from,LITERAL_BLOCK))return false;
  const selected=state.sliceDoc(from,to);
  const [open,close]=pair;
  const insert=open+selected+close;
  view.dispatch({
   changes:{from,to,insert},
   selection:{anchor:from+open.length,head:from+open.length+selected.length},
   effects:open.length===1&&close.length===1&&!['*','~','`','='].includes(text)
    ?pushPairEffect.of({from,to:from+open.length+selected.length,open,close})
    :undefined,
   userEvent:'input.type',
   annotations:isolateHistory.of('full'),
  });
  return true;
 }

 const head=from;
 const top=activeTopPair(state,state.field(autoPairField));

 // Normalize fullwidth heading/quote/task prefixes (`＃ `, `》 `, `[] `, `【】 `) on Space so CJK typing feels effortless.
 if((text===' '||text==='\u3000')&&!inSyntax(state,head,LITERAL_BLOCK)){
  const ln=state.doc.lineAt(head);
  const before=state.sliceDoc(ln.from,head);
  const fwHead=/^([ \t]*)([#＃]{1,6})$/.exec(before);
  if(fwHead&&(fwHead[2].includes('＃')||text==='\u3000')){
   const normalized=fwHead[1]+'#'.repeat(fwHead[2].length)+' ';
   view.dispatch({
    changes:{from:ln.from,to:head,insert:normalized},
    selection:{anchor:ln.from+normalized.length},
    effects:clearPairsEffect.of(null),
    userEvent:'input.type',
   });
   return true;
  }
  const fwQuote=/^([ \t]*)[>》]$/.exec(before);
  if(fwQuote&&(before.includes('》')||text==='\u3000')){
   const normalized=fwQuote[1]+'> ';
   view.dispatch({
    changes:{from:ln.from,to:head,insert:normalized},
    selection:{anchor:ln.from+normalized.length},
    effects:clearPairsEffect.of(null),
    userEvent:'input.type',
   });
   return true;
  }
  const taskShorthand=/^([ \t]*(?:[-+*][ \t]+)?)(?:\[\s?\]|【\s?】)$/.exec(before);
  if(taskShorthand){
   const prefix=taskShorthand[1].replace(/[-+*][ \t]+$/,'');
   const normalized=prefix+'- [ ] ';
   view.dispatch({
    changes:{from:ln.from,to:head,insert:normalized},
    selection:{anchor:ln.from+normalized.length},
    effects:clearPairsEffect.of(null),
    userEvent:'input.type',
   });
   return true;
  }
  const fwList=/^([ \t]*(?:[-+*]|\d+[.)]))$/.exec(before);
  if(fwList&&text==='\u3000'){
   const normalized=fwList[1]+' ';
   view.dispatch({
    changes:{from:ln.from,to:head,insert:normalized},
    selection:{anchor:ln.from+normalized.length},
    effects:clearPairsEffect.of(null),
    userEvent:'input.type',
   });
   return true;
  }
 }

 // Upgrade empty inline `$|$` on a blank/standalone line into a block math card `$$\n\n$$` when user presses `$` a second time.
 if(text==='$'&&top&&top.open==='$'&&head===top.from+1&&top.to===head){
  const line=state.doc.lineAt(head);
  const before=state.sliceDoc(line.from,top.from).trim();
  const after=state.sliceDoc(top.to+1,line.to).trim();
  if(!before&&!after&&!inSyntax(state,head,LITERAL_BLOCK)){
   const blockRaw='$$\n\n$$';
   view.dispatch({
    changes:{from:line.from,to:line.to,insert:blockRaw},
    selection:{anchor:line.from+3},
    effects:[clearPairsEffect.of(null),openBlockMathEffect.of(line.from)],
    userEvent:'input.math',
    annotations:isolateHistory.of('full'),
    scrollIntoView:true,
   });
   return true;
  }
 }

 // Jump over matching closer.
 if(top&&head===top.to&&closerMatches(top.close,text)){
  view.dispatch({
   selection:{anchor:top.to+top.close.length},
   effects:popPairEffect.of(1),
   scrollIntoView:true,
  });
  return true;
 }

 // Smart typography: `--` -> `—`, `---` -> divider, `...` -> `…`.
 const line=state.doc.lineAt(head);
 const lineBefore=state.sliceDoc(line.from,head);
 const trimmedLine=lineBefore.trimStart();
 const lastToken=lineBefore.split(/[\s([“‘"']/).pop()||'';
 const inUrl=lastToken.includes('://');
 const inCodeOrMath=inSyntax(state,head,CODE_OR_MATH);

 if(text==='-'&&!inCodeOrMath&&!inUrl&&!trimmedLine.startsWith('|')){
  // Third hyphen after `—` on an otherwise empty non-frontmatter line creates a divider rule.
  if(line.number>1&&line.text==='—'&&head===line.to){
   const insert='---\n\n';
   view.dispatch({
    changes:{from:line.from,to:line.to,insert},
    selection:{anchor:line.from+insert.length},
    effects:[clearPairsEffect.of(null),setRollbackEffect.of({pos:line.from+insert.length,from:line.from,insertLen:insert.length,literal:'—'})],
    userEvent:'input.type',
    annotations:isolateHistory.of('full'),
    scrollIntoView:true,
   });
   return true;
  }
  if(lineBefore.endsWith('-')&&!lineBefore.endsWith('--')&&!lineBefore.endsWith('<!-')&&!lineBefore.endsWith('\\-')){
   view.dispatch({
    changes:{from:head-1,to:head,insert:'—'},
    selection:{anchor:head},
    effects:setRollbackEffect.of({pos:head,from:head-1,insertLen:1,literal:'--'}),
    userEvent:'input.type',
    annotations:isolateHistory.of('full'),
   });
   return true;
  }
 }

 if(text==='.'&&!inCodeOrMath&&!inUrl){
  if(lineBefore.endsWith('..')&&!lineBefore.endsWith('...')&&!lineBefore.endsWith('\\..')){
   view.dispatch({
    changes:{from:head-2,to:head,insert:'…'},
    selection:{anchor:head-1},
    effects:setRollbackEffect.of({pos:head-1,from:head-2,insertLen:1,literal:'...'}),
    userEvent:'input.type',
    annotations:isolateHistory.of('full'),
   });
   return true;
  }
 }

 // Auto-pair opening character.
 const closeChar=ASCII_PAIRS[text]??CJK_OPEN_PAIRS[text];
 if(closeChar){
  const prevChar=head>0?state.sliceDoc(head-1,head):'';
  const nextChar=head<state.doc.length?state.sliceDoc(head,head+1):'';
  if(prevChar==='\\')return false;
  if(text==='$'){
   if(inCodeOrMath||prevChar==='$')return false;
  }
  if(text==="'"){
   if(/[A-Za-z0-9]/.test(prevChar))return false;
   if(nextChar&&!/[\s)\]}'"」』）】》，。！？；：、]/.test(nextChar))return false;
  }
  if(text==='"'&&nextChar&&!/[\s)\]}'"」』）】》，。！？；：、]/.test(nextChar))return false;
  if((text==='('||text==='['||text==='{')&&inSyntax(state,head,/^(MathBlock|MathFence|MermaidFence)$/))return false;
  view.dispatch({
   changes:{from:head,to:head,insert:text+closeChar},
   selection:{anchor:head+1},
   effects:pushPairEffect.of({from:head,to:head+1,open:text,close:closeChar}),
   userEvent:'input.type',
   annotations:smartInputAnnotation.of(true),
  });
  return true;
 }

 return false;
}

function applyAutoSpaceToChars(
 view:EditorView,
 insertFrom:number,
 insertTo:number,
 composing:StateField<boolean>,
){
 if(insertTo<=insertFrom)return;
 const state=view.state;
 if(state.readOnly||view.composing||state.field(composing))return;
 if(inSyntax(state,insertFrom,CODE_OR_MATH))return;
 const firstChar=state.sliceDoc(insertFrom,insertFrom+1);
 const lastChar=state.sliceDoc(insertTo-1,insertTo);
 const prevChar=insertFrom>0?state.sliceDoc(insertFrom-1,insertFrom):'';
 const nextChar=insertTo<state.doc.length?state.sliceDoc(insertTo,insertTo+1):'';
 const addLeft=needAutoSpace(prevChar,firstChar);
 const addRight=needAutoSpace(lastChar,nextChar);
 if(!addLeft&&!addRight)return;
 const changes:{from:number;to:number;insert:string}[]=[];
 if(addLeft)changes.push({from:insertFrom,to:insertFrom,insert:' '});
 if(addRight)changes.push({from:insertTo,to:insertTo,insert:' '});
 const anchor=insertTo+(addLeft?1:0);
 view.dispatch({
  changes,
  selection:{anchor},
  annotations:smartInputAnnotation.of(true),
  userEvent:'input.autospace',
 });
}

const FORMAT_PAIR_TOKENS:[string,string][]=[
 ['**','**'],
 ['~~','~~'],
 ['==','=='],
 ['_','_'],
 ['*','*'],
 ['`','`'],
];

const ENCLOSURE_NODE_DELIMS:Record<string,string>={
 StrongEmphasis:'**',
 Emphasis:'*',
 Strikethrough:'~~',
 Highlight:'==',
 InlineCode:'`',
};

interface EnclosureGuard {
 nodeFrom:number;
 boundary:number;
 delim:string;
}

function findRightBoundaryEnclosure(state:EditorState,pos:number):EnclosureGuard|null{
 const tree=ensureSyntaxTree(state,Math.min(state.doc.length,pos+2),80)||syntaxTree(state);
 for(let n:SyntaxNode|null=tree.resolveInner(pos,-1);n;n=n.parent){
  const delim=ENCLOSURE_NODE_DELIMS[n.name];
  if(delim&&n.to===pos&&state.sliceDoc(n.to-delim.length,n.to)===delim){
   return {nodeFrom:n.from,boundary:n.to,delim};
  }
  if(n.name==='Emphasis'&&n.to===pos&&state.sliceDoc(n.to-1,n.to)==='_'){
   return {nodeFrom:n.from,boundary:n.to,delim:'_'};
  }
 }
 return null;
}

const blockPrefixGuard=EditorState.transactionFilter.of(tr=>{
 if(tr.startState.readOnly||!tr.startState.doc.length)return tr;
 if(!tr.docChanged&&tr.selection&&tr.selection.ranges.length===1&&tr.selection.main.empty){
  if(tr.isUserEvent('select.pointer')){
   const head=tr.selection.main.head;
   const line=tr.state.doc.lineAt(head);
   const pLen=hiddenBlockPrefixLen(tr.state,line.from,line.text);
   if(pLen>0&&head>=line.from&&head<line.from+pLen){
    return [tr,{selection:{anchor:line.from+pLen},scrollIntoView:tr.scrollIntoView}];
   }
  }
  return tr;
 }
 if(!tr.docChanged)return tr;
 if(
  tr.annotation(smartInputAnnotation)
  ||tr.isUserEvent('undo')
  ||tr.isUserEvent('redo')
  ||tr.isUserEvent('paste')
  ||tr.isUserEvent('delete')
  ||tr.isUserEvent('input.format')
  ||tr.isUserEvent('input.autospace')
  ||tr.isUserEvent('input.block')
  ||tr.isUserEvent('input.task')
  ||tr.isUserEvent('input.indent')
  ||tr.isUserEvent('input.slash')
 )return tr;

 let singleEdit:{from:number;to:number;text:string}|null=null;
 let count=0;
 tr.changes.iterChanges((fromA,toA,_fromB,_toB,inserted)=>{
  count++;
  if(count===1)singleEdit={from:fromA,to:toA,text:inserted.toString()};
 });
 if(count!==1||!singleEdit)return tr;
 const edit=singleEdit as {from:number;to:number;text:string};
 if(edit.from!==edit.to||!edit.text||edit.text.includes('\n'))return tr;
 if(/^[#＃>》\-+* \t]+$/.test(edit.text))return tr;

 const line=tr.startState.doc.lineAt(edit.from);
 const pLen=hiddenBlockPrefixLen(tr.startState,line.from,line.text);
 const bodyStart=line.from+pLen;
 if(pLen>0&&edit.from>=line.from&&edit.from<bodyStart){
  return {
   changes:{from:bodyStart,to:bodyStart,insert:edit.text},
   selection:{anchor:bodyStart+edit.text.length},
   effects:tr.effects.length?tr.effects:undefined,
   userEvent:tr.isUserEvent('input')?'input.type':undefined,
   scrollIntoView:true,
  };
 }
 return tr;
});

export function createSmartInput(
 composing:StateField<boolean>,
 autoSpaceEnabled:()=>boolean,
):Extension{
 let pendingImeFrom:number|null=null;
 let pendingGuard:EnclosureGuard|null=null;

 return [
  autoPairField,
  autoPairDecorations,
  rollbackField,
  blockPrefixGuard,
  Prec.highest(keymap.of([
   {key:'Tab',run:view=>tryTabOutPair(view,composing)},
   {key:'Backspace',run:view=>trySmartBackspace(view,composing)},
   {key:'Home',run:view=>trySmartHome(view,composing)},
   {key:'ArrowLeft',run:view=>trySmartArrowLeft(view,composing)},
   {key:'Enter',run:view=>tryEnterTable(view,composing)||tryExitEmptyQuote(view,composing)},
  ])),
  EditorView.inputHandler.of((view,from,to,text)=>handleSmartInput(view,from,to,text,composing)),
  EditorView.updateListener.of(update=>{
   if(update.state.readOnly)return;
   const skip=update.transactions.some(tr=>tr.annotation(smartInputAnnotation)||tr.isUserEvent('undo')||tr.isUserEvent('redo')||tr.isUserEvent('paste'));
   if(skip)return;

   // Push newly created inline format wrappers (`input.format` like `**|**` or `==|==`) onto autoPair so Tab exits cleanly.
   if(update.docChanged&&update.transactions.some(tr=>tr.isUserEvent('input.format'))){
    const sel=update.state.selection.main;
    if(sel.empty){
     for(const [open,close] of FORMAT_PAIR_TOKENS){
      const oFrom=sel.head-open.length,cTo=sel.head+close.length;
      if(oFrom>=0&&cTo<=update.state.doc.length&&update.state.sliceDoc(oFrom,sel.head)===open&&update.state.sliceDoc(sel.head,cTo)===close){
       update.view.dispatch({
        effects:pushPairEffect.of({from:oFrom,to:sel.head,open,close}),
        annotations:smartInputAnnotation.of(true),
       });
       return;
      }
     }
    }
   }

   // Track range & adjacent enclosure right-boundary during IME composition (enclosure-caret protection).
   const wasComposing=update.startState.field(composing);
   const nowComposing=update.state.field(composing);
   if(!wasComposing&&nowComposing){
    const sel=update.startState.selection.main;
    pendingImeFrom=sel.from;
    pendingGuard=sel.empty?findRightBoundaryEnclosure(update.startState,sel.head):null;
   }
   if(nowComposing&&update.docChanged&&pendingImeFrom!==null){
    update.changes.iterChanges((from)=>{pendingImeFrom=Math.min(pendingImeFrom!,from)});
   }

   // Direct single CJK opener pair after IME commit or normal CJK input.
   let pairedCjk=false;
   if(!nowComposing&&update.docChanged&&update.transactions.some(tr=>tr.isUserEvent('input.type'))){
    const sel=update.state.selection.main;
    if(sel.empty&&sel.head>0){
     const ch=update.state.sliceDoc(sel.head-1,sel.head);
     const close=CJK_OPEN_PAIRS[ch];
     if(close&&!inSyntax(update.state,sel.head,CODE_OR_MATH)){
      const after=sel.head<update.state.doc.length?update.state.sliceDoc(sel.head,sel.head+1):'';
      if(after!==close){
       pairedCjk=true;
       pendingImeFrom=null;
       pendingGuard=null;
       update.view.dispatch({
        changes:{from:sel.head,to:sel.head,insert:close},
        selection:{anchor:sel.head},
        effects:pushPairEffect.of({from:sel.head-1,to:sel.head,open:ch,close}),
        annotations:smartInputAnnotation.of(true),
        userEvent:'input.autopair',
       });
       return;
      }
     }
    }
   }

   if(wasComposing&&!nowComposing){
    const sel=update.state.selection.main;
    const guard=pendingGuard;
    let from=pendingImeFrom!==null?Math.min(pendingImeFrom,sel.head):Math.max(0,sel.head-1);
    pendingImeFrom=null;
    pendingGuard=null;

    // Relocate text that WebView IME misattributed inside the closing delimiter of an adjacent span.
    if(guard&&sel.empty&&sel.head>guard.nodeFrom){
     const dLen=guard.delim.length;
     const docText=update.state.doc;
     if(sel.head+dLen<=docText.length&&docText.sliceString(sel.head,sel.head+dLen)===guard.delim){
      const insideStart=Math.max(guard.nodeFrom,guard.boundary-dLen);
      const misplaced=docText.sliceString(insideStart,sel.head);
      if(misplaced){
       update.view.dispatch({
        changes:[
         {from:insideStart,to:sel.head,insert:''},
         {from:sel.head+dLen,to:sel.head+dLen,insert:misplaced},
        ],
        selection:{anchor:sel.head+dLen},
        annotations:smartInputAnnotation.of(true),
        userEvent:'input.ime.relocate',
       });
       if(autoSpaceEnabled()){
        applyAutoSpaceToChars(update.view,insideStart+dLen,sel.head+dLen,composing);
       }
       return;
      }
     }
    }

    if(autoSpaceEnabled()&&!pairedCjk&&sel.empty&&sel.head>from){
     applyAutoSpaceToChars(update.view,from,sel.head,composing);
    }
    return;
   }

   if(!autoSpaceEnabled()||pairedCjk)return;

   if(!nowComposing&&update.docChanged&&update.transactions.some(tr=>tr.isUserEvent('input.type'))){
    const sel=update.state.selection.main;
    if(!sel.empty)return;
    let insFrom=-1,insTo=-1,count=0;
    update.changes.iterChanges((_a,_b,fromB,toB)=>{
     count++;
     insFrom=fromB;
     insTo=toB;
    });
    if(count===1&&insTo>insFrom&&insTo===sel.head){
     applyAutoSpaceToChars(update.view,insFrom,insTo,composing);
    }
   }
  }),
 ];
}
