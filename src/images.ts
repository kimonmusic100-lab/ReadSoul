import MarkdownIt from 'markdown-it';
import {mermaidSource} from './mermaid';
import type Token from 'markdown-it/lib/token.mjs';
import {ChangeSet,EditorState,Transaction,type ChangeDesc,type Text,type TransactionSpec} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {syntaxTree} from '@codemirror/language';
import type {Tree} from '@lezer/common';
import {blockAt,deleteBlocks} from './blocks';

export interface ImageModel {src:string;alt:string;title?:string;width?:number;height?:number;align:'left'|'center'|'right';wrap?:'float'|'free';x?:number;y?:number}
export type ImageAction='resize'|'left'|'center'|'right'|'wrap-left'|'wrap-right'|'original'|'alt'|'delete';
export interface MathRange {from:number;to:number;source:string}
export interface ImageRange {from:number;to:number;raw:string;image:ImageModel;quotes:number;listEms:number;inline?:boolean}
const parser=new MarkdownIt(),decode=parser.utils.unescapeAll;
const escapeHTML=(s:string)=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escapeMarkdown=(s:string)=>s.replace(/\\/g,'\\\\').replace(/[\[\]*_`!~]/g,'\\$&').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]/g,' ');
export function imageAltText(tokens:Token[]):string{return tokens.map(token=>token.type==='image'?imageAltText(token.children||[]):token.type==='math_inline'?'$'+token.content+'$':['text','text_special','code_inline','html_inline'].includes(token.type)?token.content:['softbreak','hardbreak'].includes(token.type)?'\n':'').join('')}
const parsed=new Map<string,ImageModel|null>();
export function parseImage(raw:string):ImageModel|null{
 if(!/^\s*(?:!\[|<img\b|<p\b)/i.test(raw))return null;
 if(parsed.has(raw))return parsed.get(raw)!;
 const image=readImage(raw);if(parsed.size>=512)parsed.clear();parsed.set(raw,image);return image;
}
function readImage(raw:string):ImageModel|null{
 if(!/^\s*(?:!\[|<img\b|<p\b)/i.test(raw))return null;
 let text=raw.trim(),align:ImageModel['align']='left',wrap:ImageModel['wrap'];
 const wrapMatch=/^<p\s+class\s*=\s*["']([^"']*\bmd-wrap-(left|right)\b[^"']*)["']\s*>\s*([\s\S]*?)\s*<\/p>$/i.exec(text);
 const alignMatch=wrapMatch?null:/^<p\s+align\s*=\s*["'](left|center|right)["']\s*>\s*([\s\S]*?)\s*<\/p>$/i.exec(text);
 if(wrapMatch){align=wrapMatch[2].toLowerCase() as 'left'|'right';wrap='float';text=wrapMatch[3]}
 else if(alignMatch){align=alignMatch[1].toLowerCase() as ImageModel['align'];text=alignMatch[2]}
 if(/^<img\b/i.test(text)){
  const tag=/^<img\s+((?:[^"'<>]|"[^"]*"|'[^']*')*)\/?\s*>$/i.exec(text);if(!tag)return null;
  const attrs:Record<string,string>={};let rest=tag[1].replace(/\/\s*$/,'');
  while(rest.trim()){
   const attr=/^\s*([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))\s*/.exec(rest);if(!attr)return null;
   const key=attr[1].toLowerCase();if(!['src','alt','title','width','height','class','data-x','data-y'].includes(key)||key in attrs)return null;
   // HTML attributes decode entities but do not interpret Markdown backslash escapes.
   attrs[key]=decode((attr[2]??attr[3]??attr[4]).replace(/\\/g,'\\\\'));rest=rest.slice(attr[0].length);
  }
  if(!attrs.src)return null;
  if(!wrapMatch&&attrs.class){
   if(/\bmd-wrap-free\b/i.test(attrs.class)){wrap='free';align='left'}
   else{
    const cls=/\bmd-wrap-(left|right)\b/i.exec(attrs.class);
    if(cls){align=cls[1].toLowerCase() as 'left'|'right';wrap='float'}
   }
  }
  const size=(key:string)=>/^\d+(?:\.\d+)?$/.test(attrs[key]||'')&&Number(attrs[key])>0?Number(attrs[key]):undefined;
  const xRatio=/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test((attrs['data-x']||'').trim())?Math.max(0,Math.min(1,Number(attrs['data-x']))):undefined;
  const yOff=/^-?\d+(?:\.\d+)?$/.test((attrs['data-y']||'').trim())?Math.max(-40,Math.min(400,Math.round(Number(attrs['data-y'])))):undefined;
  return {src:attrs.src,alt:attrs.alt||'',...(attrs.title!==undefined?{title:attrs.title}:{}),...(size('width')?{width:size('width')}:{}),...(size('height')?{height:size('height')}:{}),align,...(wrap?{wrap}:{}),...(wrap==='free'&&xRatio!==undefined?{x:xRatio}:{}),...(wrap==='free'&&yOff!==undefined?{y:yOff}:{})};
 }
 if(wrapMatch||alignMatch)return null;
 const tokens=parser.parse(text,{}),children=tokens.length===3&&tokens[0].type==='paragraph_open'?tokens[1].children:null;
 if(children?.length!==1||children[0].type!=='image')return null;
 const token=children[0],src=token.attrGet('src');if(!src)return null;
 const title=token.attrGet('title');
 return {src,alt:imageAltText(token.children||[]),...(title!==null?{title}:{}),align};
}
// Keep raw destinations (including existing percent escapes) for both the backend and serializer.
parser.normalizeLink=s=>s;
export function serializeImage(image:ImageModel,inline=false):string{
 const {src,alt,title,width,height,align,wrap,x,y}=image;
 if(wrap!=='float'&&wrap!=='free'&&align==='left'&&width===undefined&&height===undefined&&!inline){
  const dest=escapeHTML(src).replace(/\\/g,'\\\\'),path=/[\s()<>]/.test(src)?'<'+dest+'>':dest;
  return '!['+escapeMarkdown(alt)+']('+path+(title!==undefined?' "'+escapeHTML(title).replace(/\\/g,'\\\\')+'"':'')+')';
 }
 const wrapClass=wrap==='free'?'md-wrap-free':wrap==='float'&&(align==='left'||align==='right')?'md-wrap-'+align:'';
 const xAttr=wrap==='free'&&x!==undefined?' data-x="'+Math.max(0,Math.min(1,x)).toFixed(3)+'"':'';
 const yAttr=wrap==='free'&&y!==undefined&&Math.abs(Math.round(y))>=1?' data-y="'+Math.round(y)+'"':'';
 const img='<img src="'+escapeHTML(src)+'" alt="'+escapeHTML(alt)+'"'+(title!==undefined?' title="'+escapeHTML(title)+'"':'')+(wrap==='free'||(inline&&wrapClass)?' class="'+wrapClass+'"':'')+xAttr+yAttr+(width!==undefined?' width="'+Math.round(width)+'"':'')+(height!==undefined?' height="'+height+'"':'')+'>';
 if(inline||wrap==='free')return img;
 if(wrap==='float'&&(align==='left'||align==='right'))return '<p class="md-wrap-'+align+'">'+img+'</p>';
 return align==='left'?img:'<p align="'+align+'">'+img+'</p>';
}
// Keyed by the text, which a caret move keeps along with the tree.
const ranges=new WeakMap<Text,{tree:Tree;images:ImageRange[];tables:{from:number;to:number}[];math:MathRange[];mermaid:MathRange[]}>();
export function imageRanges(state:EditorState):ImageRange[]{
 const tree=syntaxTree(state),cached=ranges.get(state.doc);if(cached?.tree===tree)return cached.images;
 const out:ImageRange[]=[],tables:{from:number;to:number}[]=[],math:MathRange[]=[],mermaid:MathRange[]=[];
 // Images, tables, display math and diagrams share one tree walk; ordinary prose never goes through the image parser.
 tree.iterate({enter:n=>{
  if(['Document','BulletList','OrderedList','ListItem','Blockquote'].includes(n.name))return;
  if(n.name==='MathBlock'||n.name==='MathFence'){math.push({from:n.from,to:n.to,source:n.node.getChildren('MathText').map(t=>state.sliceDoc(t.from,t.to)).join('\n').trim()});return false}
  if(n.name==='MermaidFence'){const source=mermaidSource(n.node,(from,to)=>state.sliceDoc(from,to));if(source!==null)mermaid.push({from:n.from,to:n.to,source});return false}
  if(n.name==='Table'){tables.push({from:n.from,to:n.to});return false}
  if(!['Paragraph','Task','HTMLBlock'].includes(n.name))return false;
  const node=n.node;let candidates:Set<number>|undefined;
  if(n.name==='HTMLBlock'){
   candidates=new Set();for(let i=state.doc.lineAt(n.from).number,last=state.doc.lineAt(n.to).number;i<=last;i++)candidates.add(i);
  }else for(let child=node.firstChild;child;child=child.nextSibling){
   if(child.name==='Image'||child.name==='HTMLTag')(candidates??=new Set()).add(state.doc.lineAt(child.from).number);
  }
  if(!candidates)return false;
  let quotes=0,listEms=0;for(let parent=node.parent;parent;parent=parent.parent){if(parent.name==='Blockquote')quotes++;else if(parent.name==='BulletList'||parent.name==='OrderedList')listEms+=parent.getChildren('ListItem').some(item=>item.getChild('Task'))?0.2:1.7}
  for(const i of candidates){
   const line=state.doc.line(i),start=n.name==='Task'&&line.from<=n.from?node.getChild('TaskMarker')!.to:Math.max(n.from,line.from);
   const text=state.sliceDoc(start,line.to),prefix=/^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?[ \t]*/.exec(text)![0];
   const raw=text.slice(prefix.length).trimEnd(),wholeImage=parseImage(raw);
   if(wholeImage){
    out.push({from:start+prefix.length,to:line.to-(text.length-prefix.length-raw.length),raw,image:wholeImage,quotes,listEms,inline:false});
    continue;
   }
   // 段内紧密环绕标签：当同行中除列表/引用前缀外还有其他正文字符时，仅精确替换 <img> 节点范围
   if(n.name!=='HTMLBlock'){
    for(let child=node.firstChild;child;child=child.nextSibling){
     if(child.name!=='HTMLTag'&&child.name!=='Image')continue;
     if(state.doc.lineAt(child.from).number!==i)continue;
     const tagRaw=state.sliceDoc(child.from,child.to),inlineImg=parseImage(tagRaw);
     if(inlineImg)out.push({from:child.from,to:child.to,raw:tagRaw,image:inlineImg,quotes,listEms,inline:true});
    }
   }
  }
  return false;
 }});ranges.set(state.doc,{tree,images:out,tables,math,mermaid});return out;
}
// Called only when an edit is confined to unchanged prose syntax; all widget source remains byte-identical.
export function mapImageRanges(before:EditorState,after:EditorState,changes:ChangeDesc){
 const cached=ranges.get(before.doc);if(!cached||cached.tree!==syntaxTree(before))return false;
 const map=(range:{from:number;to:number})=>({from:changes.mapPos(range.from,1),to:changes.mapPos(range.to,-1)});
 ranges.set(after.doc,{tree:syntaxTree(after),images:cached.images.map(image=>({...image,...map(image)})),tables:cached.tables.map(map),math:cached.math.map(formula=>({...formula,...map(formula)})),mermaid:cached.mermaid.map(diagram=>({...diagram,...map(diagram)}))});return true;
}
export function clampImageWidth(width:number,column:number){const max=Math.max(1,Math.floor(column));return Math.min(max,Math.max(Math.min(48,max),Math.round(width)))}
export function mermaidRanges(state:EditorState){imageRanges(state);return ranges.get(state.doc)!.mermaid}
export function mathRanges(state:EditorState){imageRanges(state);return ranges.get(state.doc)!.math}
export function tableRanges(state:EditorState){imageRanges(state);return ranges.get(state.doc)!.tables}
function isInlineImageInText(state:EditorState,range:{from:number;to:number}):boolean{
 const line=state.doc.lineAt(range.from);
 const rawBefore=state.sliceDoc(line.from,range.from);
 const prefix=/^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?[ \t]*/.exec(rawBefore)![0];
 return rawBefore.slice(prefix.length).trim().length>0||state.sliceDoc(range.to,line.to).trim().length>0;
}
export function deleteImage(state:EditorState,range:{from:number;to:number}):TransactionSpec{
 if(isInlineImageInText(state,range)){
  return {changes:{from:range.from,to:range.to,insert:''},selection:{anchor:range.from},userEvent:'delete.image',annotations:isolateHistory.of('full')};
 }
 const doc=state.doc,line=doc.lineAt(range.from),block=blockAt(state,range.from);
 if(!block||block.from===line.from&&block.to===line.to)return deleteBlocks(state,range);
 const empty=(text:string)=>/^[ \t]*(?:>[ \t]*)*$/.test(text),prefix=state.sliceDoc(line.from,range.from);
 let from=line.from,to=Math.min(doc.length,line.to+1),insert='';
 if(block.from===line.from&&/(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?$/.test(prefix)){
  // Promote the next paragraph into the item's first line, keeping its list and quote markers.
  for(let n=line.number+1;n<=doc.lines&&doc.line(n).from<=block.to;n++){
   const next=doc.line(n);if(empty(next.text))continue;
   to=next.from+/^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(next.text)![0].length;insert=prefix;break;
  }
 }else if(line.number<doc.lines&&doc.line(line.number+1).from<=block.to&&empty(doc.line(line.number+1).text))to=Math.min(doc.length,doc.line(line.number+1).to+1);
 else if(line.number>1&&doc.line(line.number-1).from>=block.from&&empty(doc.line(line.number-1).text))from=doc.line(line.number-1).from;
 return {changes:{from,to,insert},selection:{anchor:from+insert.length},userEvent:'delete.image',annotations:isolateHistory.of('full')};
}
export function editImage(state:EditorState,range:{from:number;to:number},action:ImageAction,value?:string|number):TransactionSpec{
 if(action==='delete')return deleteImage(state,range);
 const original=parseImage(state.sliceDoc(range.from,range.to));if(!original)return {};const image={...original};
 const inline=isInlineImageInText(state,range);
 if(action==='resize'){image.width=Math.round(Number(value));delete image.height}
 else if(action==='original'){delete image.width;delete image.height}
 else if(action==='alt')image.alt=String(value??'').replace(/[\r\n]/g,' ');
 else if(action==='wrap-left'){image.align='left';image.wrap='float';delete image.x;delete image.y;if(typeof value==='number'&&value>0){image.width=Math.round(value);delete image.height}}
 else if(action==='wrap-right'){image.align='right';image.wrap='float';delete image.x;delete image.y;if(typeof value==='number'&&value>0){image.width=Math.round(value);delete image.height}}
 else{delete image.wrap;delete image.x;delete image.y;image.align=action}
 const keepInline=inline&&(image.wrap==='float'||image.wrap==='free');
 let insert=serializeImage(image,keepInline);
 if(inline&&!keepInline){
  // 若从段内行内绕排切回居中独立成行，则自动前后断出空行避免与段落混排破坏格式
  const before=state.sliceDoc(Math.max(0,range.from-2),range.from);
  const after=state.sliceDoc(range.to,Math.min(state.doc.length,range.to+2));
  const lead=before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n';
  const trail=after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n';
  insert=lead+insert+trail;
 }
 return {changes:{...range,insert},userEvent:'input.image',annotations:isolateHistory.of('full')};
}

export interface MoveImageResult {
 spec: TransactionSpec;
 nextRange: {from:number;to:number};
}

/** 在纯净基准文档的指定位置插入图片，返回基于基准文档的 ChangeSet 与新图片范围。 */
export function insertImageAtBase(
 baseDoc: Text,
 targetPos: number,
 image: ImageModel,
 inline: boolean,
): { changes: ChangeSet; nextRange: { from: number; to: number } } {
 const pos = Math.max(0, Math.min(baseDoc.length, targetPos));
 const inlineMode = inline && (image.wrap === 'float' || image.wrap === 'free');
 const serialized = serializeImage(image, inlineMode);
 let prefix = '';
 let suffix = '';
 if (!inlineMode) {
  const beforeTwo = baseDoc.sliceString(Math.max(0, pos - 2), pos);
  const afterTwo = baseDoc.sliceString(pos, Math.min(baseDoc.length, pos + 2));
  if (pos > 0) {
   if (beforeTwo.endsWith('\n\n')) prefix = '';
   else if (beforeTwo.endsWith('\n')) prefix = '\n';
   else prefix = '\n\n';
  }
  if (pos < baseDoc.length) {
   if (afterTwo.startsWith('\n\n')) suffix = '';
   else if (afterTwo.startsWith('\n')) suffix = '\n';
   else suffix = '\n\n';
  }
 }
 const insert = prefix + serialized + suffix;
 const changes = ChangeSet.of([{ from: pos, to: pos, insert }], baseDoc.length);
 const start = pos + prefix.length;
 return { changes, nextRange: { from: start, to: start + serialized.length } };
}

/** 将图片重排并移动到目标文档位置（支持跨段与段内任意位置及居中独立成行）。 */
function moveImage(
 state: EditorState,
 range: {from:number;to:number},
 insertPos: number | null,
 layout: {align:'left'|'center'|'right';wrap?:'float'|'free';width?:number;inline?:boolean;x?:number;y?:number},
 options?: {addToHistory?:boolean;userEvent?:string},
): MoveImageResult | null {
 const currentRaw = state.sliceDoc(range.from, range.to);
 const original = parseImage(currentRaw);
 if (!original) return null;
 const next: ImageModel = { ...original, align: layout.align };
 if (layout.wrap === 'float' || layout.wrap === 'free') next.wrap = layout.wrap;
 else delete next.wrap;
 if (layout.wrap === 'free') {
  if (layout.x !== undefined) next.x = layout.x;
  if (layout.y !== undefined) next.y = layout.y;
 } else {
  delete next.x;
  delete next.y;
 }
 if (layout.width !== undefined) {
  next.width = Math.round(layout.width);
  delete next.height;
 }
 const inlineMode = !!layout.inline && (next.wrap === 'float' || next.wrap === 'free');
 const serialized = serializeImage(next, inlineMode);
 const addHistory = options?.addToHistory ?? true;
 const historyAnnotations = addHistory ? isolateHistory.of('full') : Transaction.addToHistory.of(false);

 // 若插槽就在当前图片位置（无任何实质内容分隔）且同属行内/块级类型，仅原地更新
 const sameSlot = insertPos === null
  || (insertPos >= range.from && insertPos <= range.to)
  || (!inlineMode && !isInlineImageInText(state, range) && (
    (insertPos > range.to && state.sliceDoc(range.to, insertPos).trim() === '')
    || (insertPos < range.from && state.sliceDoc(insertPos, range.from).trim() === '')
  ));

 if (sameSlot) {
  if (serialized === currentRaw) return null;
  const nextRange = { from: range.from, to: range.from + serialized.length };
  return {
   spec: {
    changes: { from: range.from, to: range.to, insert: serialized },
    userEvent: options?.userEvent || 'input.image',
    annotations: historyAnnotations,
   },
   nextRange,
  };
 }

 const delSpec = deleteImage(state, range);
 const delChanges = state.changes(delSpec.changes);
 const docAfter = delChanges.apply(state.doc);
 const targetPos = delChanges.mapPos(insertPos, insertPos > range.to ? -1 : 1);

 let prefix = '';
 let suffix = '';
 if (!inlineMode) {
  const beforeTwo = docAfter.sliceString(Math.max(0, targetPos - 2), targetPos);
  const afterTwo = docAfter.sliceString(targetPos, Math.min(docAfter.length, targetPos + 2));
  if (targetPos > 0) {
   if (beforeTwo.endsWith('\n\n')) prefix = '';
   else if (beforeTwo.endsWith('\n')) prefix = '\n';
   else prefix = '\n\n';
  }
  if (targetPos < docAfter.length) {
   if (afterTwo.startsWith('\n\n')) suffix = '';
   else if (afterTwo.startsWith('\n')) suffix = '\n';
   else suffix = '\n\n';
  }
 }

 const insertText = prefix + serialized + suffix;
 const insertChanges = ChangeSet.of([{ from: targetPos, to: targetPos, insert: insertText }], docAfter.length);
 const combined = delChanges.compose(insertChanges);
 const start = targetPos + prefix.length;
 const end = start + serialized.length;

 return {
  spec: {
   changes: combined,
   userEvent: options?.userEvent || 'move.image',
   annotations: historyAnnotations,
  },
  nextRange: { from: start, to: end },
 };
}
