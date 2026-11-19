import {call,type GlobalSearchHit,type GlobalSearchResponse,type WorkspaceState} from './types';

export interface GlobalSearchOptions {
 dialog:HTMLDialogElement;
 input:HTMLInputElement;
 status:HTMLElement;
 list:HTMLElement;
 closeBtn:HTMLButtonElement;
 beforeOpen:()=>Promise<boolean>;
 onOpenDoc:(state:WorkspaceState,hit:GlobalSearchHit)=>void;
 onError:(err:unknown)=>void;
}

export function createGlobalSearch(opts:GlobalSearchOptions){
 let hits:GlobalSearchHit[]=[];
 let activeIndex=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let reqSeq=0;

 function renderStatus(text:string){
  opts.status.textContent=text;
 }

 function updateSelection(){
  const items=opts.list.querySelectorAll<HTMLButtonElement>('.rs-gsearch-item');
  items.forEach((btn,i)=>{
   const on=i===activeIndex;
   btn.classList.toggle('active',on);
   if(on)btn.scrollIntoView({block:'nearest'});
  });
 }

 function renderHits(){
  opts.list.replaceChildren();
  const q=opts.input.value.trim();
  if(!q){
   const hint=document.createElement('p');
   hint.className='rs-gsearch-empty';
   hint.textContent='输入关键词以全文检索草稿与工作区文件夹（支持中文子串与英文词组，↑ ↓ 选区，Enter 直达行）';
   opts.list.append(hint);
   return;
  }
  if(!hits.length){
   const empty=document.createElement('p');
   empty.className='rs-gsearch-empty';
   empty.textContent=`未找到包含「${q}」的内容`;
   opts.list.append(empty);
   return;
  }
  hits.forEach((hit,i)=>{
   const btn=document.createElement('button');
   btn.type='button';
   btn.className='rs-gsearch-item'+(i===activeIndex?' active':'');
   btn.onclick=()=>void selectHit(hit);

   const top=document.createElement('div');
   top.className='rs-gsearch-top';
   const title=document.createElement('strong');
   title.textContent=hit.title||'未命名文稿';
   top.append(title);
   if(hit.heading){
    const hd=document.createElement('span');
    hd.className='rs-gsearch-heading';
    hd.textContent='# '+hit.heading;
    top.append(hd);
   }
   const loc=document.createElement('span');
   loc.className='rs-gsearch-line';
   loc.textContent=`L${hit.line}`;
   top.append(loc);
   btn.append(top);

   if(hit.path){
    const pathEl=document.createElement('div');
    pathEl.className='rs-gsearch-path';
    pathEl.textContent=hit.path;
    btn.append(pathEl);
   }

   const snippet=document.createElement('div');
   snippet.className='rs-gsearch-snippet';
   for(const part of hit.parts){
    if(part.highlight){
     const m=document.createElement('mark');
     m.textContent=part.text;
     snippet.append(m);
    }else{
     snippet.append(document.createTextNode(part.text));
    }
   }
   btn.append(snippet);
   opts.list.append(btn);
  });
 }

 async function runSearch(){
  const q=opts.input.value.trim();
  const seq=++reqSeq;
  try{
   const res=await call<GlobalSearchResponse>('GlobalSearch',q,80);
   if(seq!==reqSeq)return;
   hits=res.hits||[];
   activeIndex=0;
   renderStatus(
    q
     ?`命中 ${hits.length} 条结果 · 已索引 ${res.indexedFiles} 篇文档（${res.indexedBlocks} 段 · ${res.elapsedMs} ms）`
     :`已索引 ${res.indexedFiles} 篇文档（${res.indexedBlocks} 段）`,
   );
   renderHits();
  }catch(err){
   if(seq===reqSeq)opts.onError(err);
  }
 }

 async function selectHit(hit:GlobalSearchHit){
  opts.dialog.close();
  if(!await opts.beforeOpen())return;
  try{
   const next=hit.docId
    ?await call<WorkspaceState>('Activate',hit.docId)
    :await call<WorkspaceState>('OpenFile',hit.path);
   opts.onOpenDoc(next,hit);
  }catch(err){
   opts.onError(err);
  }
 }

 opts.input.addEventListener('input',()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>{void runSearch()},160);
 });

 opts.input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'&&hits.length){
   e.preventDefault();
   activeIndex=(activeIndex+1)%hits.length;
   updateSelection();
  }else if(e.key==='ArrowUp'&&hits.length){
   e.preventDefault();
   activeIndex=(activeIndex-1+hits.length)%hits.length;
   updateSelection();
  }else if(e.key==='Enter'&&hits.length){
   e.preventDefault();
   const hit=hits[activeIndex];
   if(hit)void selectHit(hit);
  }
 });

 opts.closeBtn.addEventListener('click',()=>opts.dialog.close());

 function open(initialQuery=''){
  if(!opts.dialog.open)opts.dialog.showModal();
  if(initialQuery)opts.input.value=initialQuery;
  requestAnimationFrame(()=>{
   opts.input.focus();
   opts.input.select();
  });
  void runSearch();
 }

 return {open};
}
