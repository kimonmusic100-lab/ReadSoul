import {EditorView,ViewPlugin} from '@codemirror/view';
import type {Extension} from '@codemirror/state';
import {wikiTarget} from './wiki-links';
import {safeLink,localDocumentLink} from './editing';

export interface HoverNoteInfo {
 title:string;
 excerpt?:string;
}

export interface LinkHoverOptions {
 onOpen:(href:string)=>void;
 onEdit?:(pos:number)=>void;
 resolveWiki?:(target:string)=>Promise<HoverNoteInfo|null>;
}

function describeHref(href:string):{kind:string;display:string}{
 const wiki=wikiTarget(href);
 if(wiki)return {kind:'双向链接',display:`[[${wiki}]]`};
 if(href.startsWith('#'))return {kind:'文内标题',display:decodeSafe(href)};
 const local=localDocumentLink(href);
 if(local)return {kind:'本地文稿',display:local.path+(local.fragment?'#'+local.fragment:'')};
 if(/^mailto:/i.test(href))return {kind:'邮件地址',display:href.slice(7)};
 if(safeLink(href))return {kind:'网页链接',display:href};
 return {kind:'链接',display:href};
}

function decodeSafe(raw:string):string{
 try{return decodeURIComponent(raw)}catch{return raw}
}

class LinkHoverPlugin{
 private card:HTMLDivElement;
 private badge:HTMLSpanElement;
 private titleEl:HTMLDivElement;
 private urlEl:HTMLDivElement;
 private openBtn:HTMLButtonElement;
 private editBtn:HTMLButtonElement;
 private copyBtn:HTMLButtonElement;
 private showTimer:ReturnType<typeof setTimeout>|0=0;
 private hideTimer:ReturnType<typeof setTimeout>|0=0;
 private currentAnchor:HTMLElement|null=null;
 private currentHref='';
 private currentPos=-1;
 private token=0;
 private destroyed=false;
 private abort=new AbortController();

 constructor(readonly view:EditorView,readonly options:LinkHoverOptions){
  this.card=document.createElement('div');
  this.card.className='rs-link-hover-card';
  this.card.hidden=true;
  this.card.setAttribute('role','tooltip');

  const top=document.createElement('div');
  top.className='rs-link-hover-top';

  this.badge=document.createElement('span');
  this.badge.className='rs-link-hover-badge';

  this.titleEl=document.createElement('div');
  this.titleEl.className='rs-link-hover-title';

  top.append(this.badge,this.titleEl);

  this.urlEl=document.createElement('div');
  this.urlEl.className='rs-link-hover-url';

  const actions=document.createElement('div');
  actions.className='rs-link-hover-actions';

  this.openBtn=document.createElement('button');
  this.openBtn.type='button';
  this.openBtn.className='rs-link-hover-btn is-primary';
  this.openBtn.textContent='打开';

  this.editBtn=document.createElement('button');
  this.editBtn.type='button';
  this.editBtn.className='rs-link-hover-btn';
  this.editBtn.textContent='编辑';

  this.copyBtn=document.createElement('button');
  this.copyBtn.type='button';
  this.copyBtn.className='rs-link-hover-btn';
  this.copyBtn.textContent='复制';

  actions.append(this.openBtn,this.editBtn,this.copyBtn);
  this.card.append(top,this.urlEl,actions);
  view.dom.append(this.card);

  const signal=this.abort.signal;

  this.card.addEventListener('mousedown',e=>e.stopPropagation(),{signal});
  this.card.addEventListener('pointerenter',()=>{
   if(this.hideTimer){clearTimeout(this.hideTimer);this.hideTimer=0}
  },{signal});
  this.card.addEventListener('pointerleave',()=>this.scheduleHide(),{signal});

  this.openBtn.addEventListener('click',()=>{
   if(!this.currentHref)return;
   const href=this.currentHref;
   this.hideNow();
   this.options.onOpen(href);
  },{signal});

  this.editBtn.addEventListener('click',()=>{
   if(this.currentPos<0)return;
   const pos=this.currentPos;
   this.hideNow();
   if(this.options.onEdit)this.options.onEdit(pos);
   else{
    this.view.dispatch({selection:{anchor:pos},scrollIntoView:true});
    this.view.focus();
   }
  },{signal});

  this.copyBtn.addEventListener('click',async()=>{
   if(!this.currentHref)return;
   const raw=wikiTarget(this.currentHref)||this.currentHref;
   try{
    await navigator.clipboard.writeText(raw);
    this.copyBtn.textContent='已复制';
    setTimeout(()=>{if(!this.destroyed)this.copyBtn.textContent='复制'},1200);
   }catch{}
  },{signal});

  view.contentDOM.addEventListener('pointerover',e=>this.onOver(e),{signal});
  view.contentDOM.addEventListener('pointerout',e=>this.onOut(e),{signal});
  view.contentDOM.addEventListener('pointerdown',()=>this.hideNow(),{signal});
  view.dom.closest('.editor-scroll')?.addEventListener('scroll',()=>this.hideNow(),{passive:true,signal});
 }

 private onOver(e:PointerEvent){
  if(e.buttons!==0||this.view.dom.closest('.read-layout'))return;
  const link=(e.target as HTMLElement|null)?.closest<HTMLElement>('.md-link[data-href]');
  if(!link||!this.view.contentDOM.contains(link))return;
  if(this.hideTimer){clearTimeout(this.hideTimer);this.hideTimer=0}
  if(link===this.currentAnchor&&!this.card.hidden)return;
  if(this.showTimer)clearTimeout(this.showTimer);
  this.showTimer=setTimeout(()=>{
   this.showTimer=0;
   if(!this.destroyed&&link.isConnected)void this.present(link);
  },240);
 }

 private onOut(e:PointerEvent){
  const fromLink=(e.target as HTMLElement|null)?.closest<HTMLElement>('.md-link[data-href]');
  if(!fromLink)return;
  const related=e.relatedTarget as HTMLElement|null;
  if(related&&(fromLink.contains(related)||this.card.contains(related)))return;
  if(this.showTimer){clearTimeout(this.showTimer);this.showTimer=0}
  this.scheduleHide();
 }

 private scheduleHide(){
  if(this.hideTimer)clearTimeout(this.hideTimer);
  this.hideTimer=setTimeout(()=>{
   this.hideTimer=0;
   this.hideNow();
  },180);
 }

 private async present(anchor:HTMLElement){
  const href=anchor.dataset.href||'';
  if(!href)return;
  let pos=-1;
  try{pos=this.view.posAtDOM(anchor,0)+1}catch{}

  this.currentAnchor=anchor;
  this.currentHref=href;
  this.currentPos=pos;

  const {kind,display}=describeHref(href);
  const labelText=anchor.textContent?.trim()||display;
  this.badge.textContent=kind;
  this.titleEl.textContent=labelText;
  this.urlEl.textContent=display;
  this.editBtn.hidden=pos<0||this.view.state.readOnly;
  this.copyBtn.textContent='复制';

  this.card.hidden=false;
  this.place(anchor);

  const wiki=wikiTarget(href);
  if(wiki&&this.options.resolveWiki){
   const myToken=++this.token;
   try{
    const info=await this.options.resolveWiki(wiki);
    if(this.destroyed||myToken!==this.token||this.card.hidden||this.currentHref!==href)return;
    if(info){
     this.titleEl.textContent=info.title||wiki;
     if(info.excerpt)this.urlEl.textContent=info.excerpt;
     this.place(anchor);
    }
   }catch{}
  }
 }

 private place(anchor:HTMLElement){
  const host=this.view.dom.getBoundingClientRect();
  const rect=anchor.getBoundingClientRect();
  const cardW=Math.min(340,Math.max(220,this.card.offsetWidth||280));
  const cardH=this.card.offsetHeight||92;
  const centerX=(rect.left+rect.right)/2-host.left;
  const left=Math.max(cardW/2+8,Math.min(Math.max(cardW/2+8,host.width-cardW/2-8),centerX));
  const scroller=this.view.dom.closest<HTMLElement>('.editor-scroll')?.getBoundingClientRect()??host;
  const above=rect.top-cardH-8>scroller.top+8||rect.bottom+cardH+10>scroller.bottom;
  const top=above?rect.top-host.top-cardH-8:rect.bottom-host.top+8;
  this.card.style.left=`${left.toFixed(1)}px`;
  this.card.style.top=`${top.toFixed(1)}px`;
 }

 private hideNow(){
  if(this.showTimer){clearTimeout(this.showTimer);this.showTimer=0}
  if(this.hideTimer){clearTimeout(this.hideTimer);this.hideTimer=0}
  this.token++;
  this.card.hidden=true;
  this.currentAnchor=null;
  this.currentHref='';
  this.currentPos=-1;
 }

 destroy(){
  this.destroyed=true;
  this.abort.abort();
  this.hideNow();
  this.card.remove();
 }
}

export function createLinkHover(options:LinkHoverOptions):Extension{
 return ViewPlugin.define(view=>new LinkHoverPlugin(view,options));
}
