import {messages} from './i18n';
import {waitMermaid} from './mermaid';
import type {MathOutput} from './math';
import {normalizeImageDestination,renderMarkdown,headingSlug} from './markdown';
export interface Delivery {title:string;content:string;images:Record<string,string>;missing:string[];external:number}
export function renderDelivery(data:Delivery,mathOutput:MathOutput='mathml'){
 const images=new Map(Object.entries(data.images).map(([src,value])=>[normalizeImageDestination(src),value]));
 // Exports are styled for white paper, so diagrams use the light theme whatever the app theme is.
 const {root}=renderMarkdown(data.content,{resolve:destination=>images.get(destination),external:'link',frontMatter:'hide',mathOutput,diagramTheme:'onelight'});
 root.className='delivery-document';
 const used=new Map<string,number>();
 for(const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6'))heading.id=headingSlug(heading.textContent||'',used);
 for(const img of root.querySelectorAll('img')){img.removeAttribute('data-image-source');img.style.maxWidth='100%';img.style.height='auto'}
 for(const note of root.querySelectorAll('.markdown-image-note')){note.className='delivery-image-note';note.setAttribute('style','display:block;margin:10px 0;padding:8px 12px;border:1px dashed #cdd2cc;border-radius:6px;color:#5b6b62;font-size:12px;line-height:1.7')}
 for(const el of root.querySelectorAll('.task-list, .task-list-item')){
  el.classList.remove('task-list','task-list-item');if(!el.getAttribute('class'))el.removeAttribute('class');
 }
 for(const el of root.querySelectorAll<HTMLElement>('[class]')){
  if(el.closest('svg'))continue;
  if(el.classList.contains('md-wrap-left'))el.dataset.wrap='left';
  else if(el.classList.contains('md-wrap-right'))el.dataset.wrap='right';
  else if(el.classList.contains('md-wrap-free'))el.dataset.wrap='free';
  for(const className of [...el.classList])if(className.startsWith('md-'))el.classList.remove(className);
  if(!el.getAttribute('class'))el.removeAttribute('class');
 }
 for(const img of root.querySelectorAll<HTMLElement>('img[data-wrap]')){
  const w=img.dataset.wrap;
  if(w==='left')img.setAttribute('style',(img.getAttribute('style')||'')+';float:left;margin:8px 18px 8px 0;max-width:56%');
  else if(w==='right')img.setAttribute('style',(img.getAttribute('style')||'')+';float:right;margin:8px 0 8px 18px;max-width:56%');
  else if(w==='free'){
   const x=Math.max(0,Math.min(100,Number(img.getAttribute('data-x')||'50')||50));
   img.setAttribute('style',(img.getAttribute('style')||'')+(x<50?';float:left;margin:8px 18px 8px 0;max-width:56%':';float:right;margin:8px 0 8px 18px;max-width:56%'));
  }
 }
 for(const el of root.querySelectorAll('[data-line], [data-line-end]')){el.removeAttribute('data-line');el.removeAttribute('data-line-end')}
 for(const a of root.querySelectorAll('a')){a.rel='noopener noreferrer'}
 // Paper exports have no interaction: fold blocks are expanded and the summary reads as a bold heading.
 for(const details of root.querySelectorAll<HTMLDetailsElement>('details')){
  details.open=true;
  const summary=details.querySelector('summary');
  if(summary)summary.setAttribute('style','display:block;font-weight:700;margin:14px 0 8px');
 }
 const styles:Record<string,string>={mark:'background:#eee2a5;color:inherit;-webkit-print-color-adjust:exact;print-color-adjust:exact',u:'text-decoration:underline',sup:'vertical-align:super;font-size:.75em;line-height:0',sub:'vertical-align:sub;font-size:.75em;line-height:0',h1:'font-family:"Times New Roman","Source Han Serif CN","思源宋体 CN","Source Han Serif SC","Noto Serif SC","思源宋体",serif;font-size:30px;line-height:1.5;margin:24px 0 18px',h2:'font-family:"DM Sans","Source Han Sans SC","Noto Sans SC","Source Han Sans CN","思源黑体","Microsoft YaHei",sans-serif;font-size:24px;font-weight:400;line-height:1.5;margin:24px 0 14px',h3:'font-family:"EB Garamond","Palatino Linotype","Georgia","KaiTi","楷体","KaiTi_GB2312","楷体_GB2312",serif;font-size:20px;line-height:1.6',h4:'font-family:"Libre Baskerville","Georgia","FangSong","仿宋","FangSong_GB2312","仿宋_GB2312",serif;font-weight:700',h5:'font-family:"Libre Baskerville","Georgia","FangSong","仿宋","FangSong_GB2312","仿宋_GB2312",serif;font-weight:700',h6:'font-family:"Libre Baskerville","Georgia","FangSong","仿宋","FangSong_GB2312","仿宋_GB2312",serif;font-weight:700',p:'line-height:1.9;margin:14px 0',blockquote:'border-left:3px solid #809387;padding-left:16px;color:#45574c',pre:'background:#f1f2ef;padding:16px;white-space:pre-wrap;font-family:"JetBrains Mono",Consolas,monospace;font-size:13px',table:'border-collapse:collapse;width:100%;margin:20px 0',hr:'height:0;border:0;border-top:1px solid #cdd2cc;margin:24px 0',th:'border:1px solid #cdd2cc;padding:9px;text-align:left;background:#edf0e9',td:'border:1px solid #cdd2cc;padding:9px;text-align:left',code:'font-family:"JetBrains Mono",Consolas,monospace',a:'color:#315f82;text-decoration:underline'};
 for(const [tag,style]of Object.entries(styles))root.querySelectorAll(tag).forEach(el=>el.setAttribute('style',style+';'+(el.getAttribute('style')||'')));
 const readerStyles:Record<string,string>={'.markdown-alert':'border-left:3px solid #809387;background:#edf2ee;padding:12px 16px;margin:18px 0','.markdown-alert-title':'font-weight:700;margin:0 0 8px;display:flex;align-items:center;gap:8px','.md-wrap-left':'float:left;margin:8px 18px 8px 0;max-width:56%','.md-wrap-right':'float:right;margin:8px 0 8px 18px;max-width:56%',kbd:'border:1px solid #cdd2cc;border-radius:4px;padding:4px 6px;font-family:"JetBrains Mono",Consolas,monospace;font-size:12px;color:#242523;background:#f1f2ef','section.footnotes':'font-size:13px'};
 for(const [selector,style] of Object.entries(readerStyles))root.querySelectorAll(selector).forEach(el=>el.setAttribute('style',(el.getAttribute('style')?el.getAttribute('style')+';':'')+style));
 for(const [kind,colour] of Object.entries({note:'#316dba',tip:'#34794c',important:'#8250b5',warning:'#8f600f',caution:'#bd4343'})){
  for(const alert of root.querySelectorAll<HTMLElement>('.markdown-alert-'+kind)){
   alert.style.borderLeftColor=colour;alert.style.background={note:'#edf2f9',tip:'#edf3ef',important:'#f4eff8',warning:'#f6f2e9',caution:'#f9eeee'}[kind as 'note'];
   const title=alert.querySelector<HTMLElement>('.markdown-alert-title');if(title)title.style.color=colour;
  }
 }
 root.querySelectorAll('.markdown-alert-title svg').forEach(el=>el.setAttribute('style','width:1em;height:1em;flex:none;vertical-align:-.1em'));
 root.querySelectorAll('input[type=checkbox]').forEach(el=>el.setAttribute('style','margin:0 8px 0 0;vertical-align:middle'));
 root.style.cssText='color-scheme:light;font-family:"Newsreader","方正FW筑紫明朝 简L","方正FW筑紫明朝简L","FZFWZhuZiMingChaoS-L","Source Han Serif CN","Noto Serif SC",serif;font-size:16px;line-height:1.9;color:#242523;background:#fff;overflow-wrap:anywhere';
 return root;
}
export async function waitImages(root:HTMLElement){await waitMermaid(root);await Promise.all([...root.querySelectorAll('img')].map(img=>new Promise<void>((resolve,reject)=>{if(img.complete){img.naturalWidth?resolve():reject(Error(messages.fTheImageCouldNotBeDecoded()));return}const timeout=setTimeout(()=>reject(Error(messages.fTheImageTookTooLongToLoad())),10000);img.onload=()=>{clearTimeout(timeout);resolve()};img.onerror=()=>{clearTimeout(timeout);reject(Error(messages.fTheImageCouldNotBeDecoded()))}})))}
export interface RichClipboard {html:string;text:string}
export async function prepareRichClipboard(root:HTMLElement):Promise<RichClipboard>{
 const copy=root.cloneNode(true) as HTMLElement;
 // AppKit treats MathML annotations as another visible formula. Basic rich text keeps one TeX source.
 for(const math of copy.querySelectorAll<HTMLElement>('.math-inline,.math-display')){
  const source=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
  if(source){const code=document.createElement('code');code.textContent=source;math.replaceChildren(code)}
 }
 const diagrams:{placeholder:HTMLElement;image:HTMLImageElement}[]=[];
 for(const svg of copy.querySelectorAll<SVGSVGElement>('svg')){
  if(svg.closest('.markdown-alert-title')){svg.remove();continue}
  const box=svg.viewBox.baseVal,width=box.width||svg.width.baseVal.value||640,height=box.height||svg.height.baseVal.value||320;
  const vector=svg.cloneNode(true) as SVGSVGElement;
  vector.setAttribute('xmlns','http://www.w3.org/2000/svg');vector.setAttribute('width',String(width));vector.setAttribute('height',String(height));
  const source=new Image();
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error(messages.fTheImageTookTooLongToLoad())),10000);
   source.onload=()=>{clearTimeout(timeout);resolve()};source.onerror=()=>{clearTimeout(timeout);reject(Error(messages.fTheImageCouldNotBeDecoded()))};
   source.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(vector));
  });
  const displayWidth=Math.min(width,720),displayHeight=height*displayWidth/width,canvas=document.createElement('canvas');
  canvas.width=Math.ceil(displayWidth*2);canvas.height=Math.ceil(displayHeight*2);
  const context=canvas.getContext('2d');if(!context)throw Error(messages.fTheImageCouldNotBeDecoded());
  context.drawImage(source,0,0,canvas.width,canvas.height);
  const image=document.createElement('img');image.src=canvas.toDataURL('image/png');
  image.width=Math.round(displayWidth);image.height=Math.round(displayHeight);image.style.cssText='max-width:100%;height:auto';
  image.alt=[...svg.querySelectorAll('text')].map(label=>label.textContent||'').filter(Boolean).join(' · ');
  const placeholder=document.createElement('span');placeholder.textContent=image.alt;svg.replaceWith(placeholder);
  diagrams.push({placeholder,image});
 }
 copy.querySelectorAll('style,annotation').forEach(el=>el.remove());
 // innerText needs layout for paragraph/list line breaks; the export DOM stays untouched.
 const container=document.createElement('div');container.style.cssText='position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none';container.setAttribute('aria-hidden','true');container.append(copy);document.body.append(container);
 try{
  const text=copy.innerText;
  for(const {placeholder,image}of diagrams)placeholder.replaceWith(image);
  return {html:'<!doctype html><html><head><meta charset="utf-8"></head><body>'+copy.outerHTML+'</body></html>',text};
 }finally{container.remove()}
}
 export async function copyRich({html,text}:RichClipboard){
 if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
  await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);return;
 }
 const listener=(e:ClipboardEvent)=>{e.preventDefault();e.clipboardData?.setData('text/html',html);e.clipboardData?.setData('text/plain',text)};
 document.addEventListener('copy',listener);try{if(!document.execCommand('copy'))throw Error(messages.fClipboardUnavailableDownloadHTMLInstead())}finally{document.removeEventListener('copy',listener)}
}
export function toStandardMarkdown(markdown:string):string{
 return markdown.replace(/<img\b([^>]*?)\/?\s*>/gi,(full,attrs:string)=>{
  const srcMatch=/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const src=(srcMatch?.[1]??srcMatch?.[2]??srcMatch?.[3]??'').trim();
  if(!src)return full;
  const altMatch=/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  const alt=(altMatch?.[1]??altMatch?.[2]??'').replace(/[\r\n]+/g,' ').replace(/\]/g,'\\]');
  const dest=/\s/.test(src)?`<${src}>`:src;
  return `![${alt}](${dest})`;
 });
}

export function buildDeliveryZip(data:Delivery,title:string,standardMarkdown=false):Uint8Array{
 const encoder=new TextEncoder(),files:Array<{name:string;bytes:Uint8Array}>=[];
 let markdown=standardMarkdown?toStandardMarkdown(data.content):data.content;
 let assetSeq=0;
 const usedNames=new Set<string>();
 for(const [rawKey,dataUrl] of Object.entries(data.images)){
  if(!dataUrl.startsWith('data:'))continue;
  let assetName=rawKey.replace(/^readsoul-asset:/,'').replace(/^assets[\\/]/,'').split(/[\\/]/).pop()||`image-${++assetSeq}.png`;
  assetName=assetName.replace(/[^a-zA-Z0-9._-]/g,'_');
  while(usedNames.has(assetName))assetName=`${++assetSeq}-${assetName}`;
  usedNames.add(assetName);
  const comma=dataUrl.indexOf(','),header=dataUrl.slice(0,comma),body=dataUrl.slice(comma+1);
  const bytes=/;base64/i.test(header)?Uint8Array.from(atob(body),c=>c.charCodeAt(0)):encoder.encode(decodeURIComponent(body));
  files.push({name:'assets/'+assetName,bytes});
  markdown=markdown.split(rawKey).join('assets/'+assetName);
 }
 files.unshift({name:(title||'document').replace(/[\\/:*?"<>|]/g,'_')+'.md',bytes:encoder.encode(markdown)});
 const crc32=(buf:Uint8Array)=>{let c=0xffffffff;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(c&1?0xedb88320:0)}return(c^0xffffffff)>>>0};
 const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
 for(const f of files){
  const nameBytes=encoder.encode(f.name),crc=crc32(f.bytes),len=f.bytes.length;
  const lh=new Uint8Array(30+nameBytes.length),lv=new DataView(lh.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint32(14,crc,true);lv.setUint32(18,len,true);lv.setUint32(22,len,true);lv.setUint16(26,nameBytes.length,true);lh.set(nameBytes,30);
  const ch=new Uint8Array(46+nameBytes.length),cv=new DataView(ch.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint32(16,crc,true);cv.setUint32(20,len,true);cv.setUint32(24,len,true);cv.setUint16(28,nameBytes.length,true);cv.setUint32(42,offset,true);ch.set(nameBytes,46);
  locals.push(lh,f.bytes);centrals.push(ch);offset+=lh.length+len;
 }
 const cSize=centrals.reduce((s,b)=>s+b.length,0),eocd=new Uint8Array(22),ev=new DataView(eocd.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,cSize,true);ev.setUint32(16,offset,true);
 const out=new Uint8Array(offset+cSize+22);let pos=0;
 for(const p of [...locals,...centrals,eocd]){out.set(p,pos);pos+=p.length}
 return out;
}
