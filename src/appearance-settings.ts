import type {Appearance} from './types';
import {icon} from './icons';
import {themes,type ThemeID,type AutoSwitch} from './theme';

const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const $$=(s:string)=>Array.from(document.querySelectorAll<HTMLElement>(s));
const node=(tag:string,text='')=>{const n=document.createElement(tag);n.textContent=text;return n};

function themeText(id:ThemeID):[string,string,string]{
 const text:Record<ThemeID,[string,string,string]>={
  onelight:['浅色','',''],
  indigo:['深色','',''],
 };
 return text[id]||text.onelight;
}

export function appearanceSettings(get:()=>Appearance,currentTheme:()=>ThemeID,save:(change:Partial<Appearance>)=>Promise<void>){
 const tabs=$$('[data-settings-tab]');
 const panelMap:Record<string,{el:HTMLElement|null;title:string}>={
  appearance:{el:document.querySelector('#settings-panel-appearance'),title:'外观'},
  about:{el:document.querySelector('#settings-panel-about'),title:'关于'},
 };

 function activateTab(tabId:string){
  const target=panelMap[tabId]?tabId:'appearance';
  tabs.forEach(t=>{
   const active=t.dataset.settingsTab===target;
   t.setAttribute('aria-selected',String(active));
   t.tabIndex=active?0:-1;
  });
  for(const [id,panel] of Object.entries(panelMap)){
   if(panel.el)panel.el.hidden=id!==target;
  }
  const titleEl=document.querySelector<HTMLElement>('#settings-panel-title');
  if(titleEl)titleEl.textContent=panelMap[target].title;
 }

 tabs.forEach((t,i)=>{
  t.onclick=()=>activateTab(t.dataset.settingsTab||'appearance');
  t.onkeydown=e=>{
   let n=-1;
   if(e.key==='ArrowDown'||e.key==='ArrowRight')n=(i+1)%tabs.length;
   if(e.key==='ArrowUp'||e.key==='ArrowLeft')n=(i+tabs.length-1)%tabs.length;
   if(e.key==='Home')n=0;
   if(e.key==='End')n=tabs.length-1;
   if(n>=0){e.preventDefault();tabs[n].click();tabs[n].focus()}
  };
 });

 document.querySelector<HTMLDialogElement>('#appearance')?.addEventListener('close',()=>{
  activateTab('appearance');
 });

 function render(){
  const p=get(),current=currentTheme(),order=themes.map(t=>t.id),focused=document.activeElement?.closest('#themes')?(document.activeElement as HTMLElement).dataset.theme:'';
  $<HTMLSelectElement>('#font-size').value=String(p.fontSize||18);
  $<HTMLSelectElement>('#line-width').value=p.lineWidth||'normal';
  const row=document.querySelector<HTMLElement>('[data-series="all"]');
  if(row){
   row.replaceChildren();
   for(const t of themes){
    const [name]=themeText(t.id),b=node('button');
    b.className='theme-option';
    b.dataset.theme=t.id;
    b.dataset.readsoulTheme=t.id;
    b.setAttribute('role','radio');
    b.setAttribute('aria-label',name);
    b.setAttribute('aria-checked',String(t.id===current));
    b.tabIndex=t.id===current?0:-1;
    b.append(node('b',name));
    if(t.id===current){const check=icon('check');check.classList.add('theme-check');b.append(check)}
    b.onclick=()=>{void save({theme:t.id,auto:'off',lightTheme:'onelight',darkTheme:'indigo'}).then(()=>$(`#themes [data-theme=${t.id}]`).focus())};
    b.onkeydown=e=>{
     const i=order.indexOf(t.id);let n=-1;
     if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(i+1)%order.length;
     if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(i+order.length-1)%order.length;
     if(e.key==='Home')n=0;if(e.key==='End')n=order.length-1;
     if(n>=0){e.preventDefault();$(`#themes [data-theme=${order[n]}]`).focus()}
    };
    row.append(b);
   }
  }
  if(focused)$(`#themes [data-theme=${focused}]`)?.focus({preventScroll:true});
  const activeAuto=p.auto==='off'?'off':'system';
  $$('[data-auto]').forEach(b=>{const on=b.dataset.auto===activeAuto;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1});
  const activeSpace=p.autoSpace===false?'off':'on';
  $$('[data-autospace]').forEach(b=>{const on=b.dataset.autospace===activeSpace;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1});
 }
 $$('[data-auto]').forEach((b,i,all)=>{
  b.onclick=()=>void save({auto:b.dataset.auto as AutoSwitch,theme:currentTheme(),lightTheme:'onelight',darkTheme:'indigo'});
  b.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=all[(i+(e.key==='ArrowRight'?1:all.length-1))%all.length];next.click();next.focus()}};
 });
 $$('[data-autospace]').forEach((b,i,all)=>{
  b.onclick=()=>void save({autoSpace:b.dataset.autospace!=='off'});
  b.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=all[(i+(e.key==='ArrowRight'?1:all.length-1))%all.length];next.click();next.focus()}};
 });
 $('#font-size').onchange=()=>void save({fontSize:Number($<HTMLSelectElement>('#font-size').value)});
 $('#line-width').onchange=()=>void save({lineWidth:$<HTMLSelectElement>('#line-width').value as Appearance['lineWidth']});
 activateTab('appearance');
 return {render};
}
