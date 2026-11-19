import {RangeSetBuilder,type EditorState,type Extension} from '@codemirror/state';
import {Decoration,EditorView,ViewPlugin,WidgetType,type DecorationSet,type ViewUpdate} from '@codemirror/view';
import {syntaxTree} from '@codemirror/language';
import {isolateHistory} from '@codemirror/commands';
import type {SyntaxNode} from '@lezer/common';

const COMMON_LANGUAGES=[
 'plaintext',
 'typescript',
 'javascript',
 'python',
 'rust',
 'go',
 'html',
 'css',
 'json',
 'bash',
 'sql',
 'yaml',
 'markdown',
];

function extractCodeBody(state:EditorState,from:number,to:number):string{
 const firstLine=state.doc.lineAt(from);
 const lastLine=state.doc.lineAt(to);
 if(firstLine.number>=lastLine.number)return '';
 const bodyStart=firstLine.to+1;
 const hasClosingFence=/^\s*(`{3,}|~{3,})\s*$/.test(lastLine.text);
 const bodyEnd=hasClosingFence?Math.max(bodyStart,lastLine.from-1):lastLine.to;
 if(bodyEnd<=bodyStart)return '';
 return state.sliceDoc(bodyStart,bodyEnd);
}

class CodeActionsWidget extends WidgetType{
 constructor(
  readonly from:number,
  readonly infoFrom:number,
  readonly infoTo:number,
  readonly language:string,
  readonly body:string,
 ){super()}

 eq(other:CodeActionsWidget){
  return other.from===this.from
   &&other.infoFrom===this.infoFrom
   &&other.infoTo===this.infoTo
   &&other.language===this.language
   &&other.body===this.body;
 }

 toDOM(view:EditorView){
  const wrap=document.createElement('span');
  wrap.className='rs-code-actions';
  wrap.contentEditable='false';

  const select=document.createElement('select');
  select.className='rs-code-lang';
  select.setAttribute('aria-label','代码块语言');
  const current=this.language||'plaintext';
  const options=COMMON_LANGUAGES.includes(current)?COMMON_LANGUAGES:[current,...COMMON_LANGUAGES];
  for(const lang of options){
   const opt=document.createElement('option');
   opt.value=lang;
   opt.textContent=lang;
   if(lang===current)opt.selected=true;
   select.append(opt);
  }

  select.addEventListener('mousedown',e=>e.stopPropagation());
  select.addEventListener('change',()=>{
   if(view.state.readOnly)return;
   const nextLang=select.value==='plaintext'?'':select.value;
   view.dispatch({
    changes:{from:this.infoFrom,to:this.infoTo,insert:nextLang},
    annotations:isolateHistory.of('full'),
    userEvent:'input.code.lang',
   });
   view.focus();
  });

  const copyBtn=document.createElement('button');
  copyBtn.type='button';
  copyBtn.className='rs-code-copy';
  copyBtn.textContent='复制';
  copyBtn.setAttribute('aria-label','复制代码块内容');
  copyBtn.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation()});
  let copiedTimer:ReturnType<typeof setTimeout>|0=0;
  copyBtn.addEventListener('click',async()=>{
   try{
    await navigator.clipboard.writeText(this.body);
    copyBtn.textContent='已复制';
    copyBtn.classList.add('is-copied');
    if(copiedTimer)clearTimeout(copiedTimer);
    copiedTimer=setTimeout(()=>{
     if(!copyBtn.isConnected)return;
     copyBtn.textContent='复制';
     copyBtn.classList.remove('is-copied');
    },1400);
   }catch{}
  });

  wrap.append(select,copyBtn);
  return wrap;
 }

 ignoreEvent(){return true}
}

function buildCodeDecorations(state:EditorState,ranges:readonly {from:number;to:number}[]):DecorationSet{
 const items:{from:number;to:number;side:number;dec:Decoration}[]=[];
 const selLines=state.selection.ranges.map(r=>({
  from:state.doc.lineAt(r.from).number,
  to:state.doc.lineAt(r.to).number,
 }));
 const lineTouched=(ln:number)=>selLines.some(s=>ln>=s.from&&ln<=s.to);
 const seen=new Set<number>();

 for(const range of ranges){
  syntaxTree(state).iterate({
   from:range.from,
   to:range.to,
   enter(ref){
    if(ref.name!=='FencedCode')return;
    const node:SyntaxNode=ref.node;
    if(seen.has(node.from))return false;
    seen.add(node.from);

    const firstLine=state.doc.lineAt(node.from);
    const lastLine=state.doc.lineAt(node.to);
    const marks=node.getChildren('CodeMark');
    const openMark=marks[0];
    const infoNode=node.getChild('CodeInfo');
    const infoFrom=infoNode?infoNode.from:(openMark?openMark.to:firstLine.to);
    const infoTo=infoNode?infoNode.to:firstLine.to;
    const lang=infoNode?state.sliceDoc(infoNode.from,infoNode.to).trim():'';
    const body=extractCodeBody(state,node.from,node.to);

    items.push({
     from:firstLine.from,
     to:firstLine.from,
     side:-1,
     dec:Decoration.line({
      class:lineTouched(firstLine.number)?'md-code-fence-line':'md-code-fence-line md-code-fence-quiet',
     }),
    });

    if(lastLine.number>firstLine.number&&/^\s*(`{3,}|~{3,})\s*$/.test(lastLine.text)){
     items.push({
      from:lastLine.from,
      to:lastLine.from,
      side:-1,
      dec:Decoration.line({
       class:lineTouched(lastLine.number)?'md-code-fence-line md-code-fence-end':'md-code-fence-line md-code-fence-end md-code-fence-quiet',
      }),
     });
    }

    if(!state.readOnly){
     items.push({
      from:firstLine.to,
      to:firstLine.to,
      side:1,
      dec:Decoration.widget({
       widget:new CodeActionsWidget(node.from,infoFrom,infoTo,lang,body),
       side:1,
      }),
     });
    }
    return false;
   },
  });
 }

 items.sort((a,b)=>a.from-b.from||a.side-b.side||a.to-b.to);
 const builder=new RangeSetBuilder<Decoration>();
 for(const item of items)builder.add(item.from,item.to,item.dec);
 return builder.finish();
}

export function createCodeBlockUI():Extension{
 return ViewPlugin.fromClass(class{
  decorations:DecorationSet;
  constructor(view:EditorView){
   this.decorations=buildCodeDecorations(view.state,view.visibleRanges);
  }
  update(u:ViewUpdate){
   if(u.docChanged||u.viewportChanged||u.selectionSet||u.startState.readOnly!==u.state.readOnly||syntaxTree(u.startState)!==syntaxTree(u.state)){
    this.decorations=buildCodeDecorations(u.state,u.view.visibleRanges);
   }
  }
 },{decorations:p=>p.decorations});
}
