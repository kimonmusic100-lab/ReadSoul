import {messages,pageLocale,localizePage,statusText,statusFailed,noticeText,localizedError} from './i18n';
import {call,desktop,type LocaleNotice,type Doc,type DocStatus,type WorkspaceState,type Appearance,type ImageResult} from './types';
import {createEditor,undo,redo,EditorState,EditorView} from './editor';
import {createDocumentFind} from './document-find';
import {createSidebarSearch,validSearchTarget} from './search';
import {wikiTarget} from './wiki-links';
import {createWikiChooser} from './wiki-chooser';
import type {SearchItem,SearchHit,SearchResponse,DocumentFilterResponse,DocumentFilterRequest,WikiResolveRequest,GlobalSearchHit} from './types';
import {createFolderTree} from './folder-tree';
import {createGlobalSearch} from './global-search';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {tagButtons} from './tag-filter';
import {blockAt,convertBlocks,duplicateBlocks,deleteBlocks,moveBlocks,insertParagraphBelow,type BlockConversion} from './blocks';
import {blockControls} from './block-ui';
import {focusTableCell,focusedTableRange,formatTableCell,tableFootnote,leaveTable,tableAround} from './table-ui';
import {focusedImageRange,isImageDragging,defaultWrapWidth} from './image-ui';
import {imageRanges,serializeImage} from './images';
import {leaveBlock} from './block-navigation';
import {filterSlashItems,insertToolbarItem,type SlashItemID,openSlashMenu} from './slash';
import {Transaction,Compartment,StateEffect,type Text} from '@codemirror/state';
import {blockFormat,setHeading,headingLevel,inlineMarkers,clearFormatting,inList,indentList,wrapSelection,insertMath,codeBlock,linkAt,makeLink,safeLink,localDocumentLink,insertTable,headings,activeFormats,type BlockKind} from './editing';
import {isolateHistory,undoDepth,redoDepth} from '@codemirror/commands';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import {applyIcons,icon} from './icons';
import {windows,keyLabel,redoKeys} from './platform';
import {shortcuts,shortcutAction,ariaKeys} from './shortcuts';
import {attachTooltips} from './tooltip';
import {attachMenu} from './menu';
import {insertFootnote} from './extras';
import {disposeMermaid} from './mermaid';
import type {RichClipboard,Delivery} from './delivery';
import {createPreviewController,type PreviewController} from './preview';
import {createSplitScrollController,type SplitScrollController} from './split-scroll';
import {createSmoothScroll,type SmoothScrollController} from './smooth-scroll';
import {normalizeImageDestination} from './markdown';
import {countWords} from './stats';
import {appearanceSettings} from './appearance-settings';
import {preserveEditorScroll} from './typography';
import {initHomeSplash} from './home-splash';
import {pasteText,dataUrlBlob,type PasteImage} from './paste-utils';
import {isDark,resolveTheme,paintTheme,watchTheme,type ThemeID} from './theme';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const $$=(s:string)=>Array.from(document.querySelectorAll<HTMLElement>(s));
const node=(tag:string,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;if(tag==='button')n.setAttribute('type','button');return n};
let state:WorkspaceState,doc:Doc,view:EditorView,appearance:Appearance,loading=false,busy=false,dirty=false;
let toastTimer:ReturnType<typeof setTimeout>,saveFlight:Promise<boolean>|null=null;
let wordCountTimer:ReturnType<typeof setTimeout>;
let generation=0,savedPosition='',closeRequested=false;
let bannerKind:'error'|'conflict'|'notice'='error';
let retainedNotices:LocaleNotice[]=[];
let failedSaveError:unknown;
let readyData:Delivery|null=null;
let readyClipboard:RichClipboard|null=null;
let removeID='',removeUntil=0,removeTimer:ReturnType<typeof setTimeout>;
let appearanceQueue:Promise<void>=Promise.resolve();
let pendingAppearance:Partial<Appearance>|null=null;
let cancelTypographyScroll=()=>{};
let preview:PreviewController;
let splitScroll:SplitScrollController|undefined;
let previewSmoothScroll:SmoothScrollController|undefined;
let documentFind:ReturnType<typeof createDocumentFind>;
let sidebarSearch:ReturnType<typeof createSidebarSearch>;
let folderTree:ReturnType<typeof createFolderTree>|undefined;
let globalSearch:ReturnType<typeof createGlobalSearch>|undefined;
let homeSplash:ReturnType<typeof initHomeSplash>|undefined;
let navigationEpoch=0;
let cancelLayoutScroll=()=>{};
let layoutBeforeRead:Appearance['layout'];
const editLock=new Compartment();
let compositionActive=false;let pendingClose=false;let pendingMissing:()=>Promise<void>=async()=>{};let prepared:HTMLElement|null=null,readyAction='';let editRange:{from:number;to:number;raw?:string}|null=null;
const sessions=new Map<string,EditorState>();
const imageCache=new Map<string,Promise<string>>();
const imageKey=(id:string,dest:string)=>id+':'+normalizeImageDestination(dest);
const mq=matchMedia('(prefers-color-scheme:dark)'),reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');
const dockQuery=matchMedia('(min-width:760px)');
let overlayOpen=false;
let drawerMode:'history'|'library'='history';
let openTabs:Array<{id:string;title:string}>=[];
let tabsEmpty=false;
try{const savedTabs=localStorage.getItem('readsoul-open-tabs');if(savedTabs){openTabs=JSON.parse(savedTabs);tabsEmpty=Array.isArray(openTabs)&&openTabs.length===0}}catch{}
function saveOpenTabs(){try{localStorage.setItem('readsoul-open-tabs',JSON.stringify(openTabs))}catch{}}
function setRailSelected(section:'home'|'library'|'sidebar'|'settings'|null){
 document.querySelector('#home-button')?.setAttribute('aria-expanded',String(section==='home'));
 document.querySelector('#library-button')?.setAttribute('aria-expanded',String(section==='library'));
 document.querySelector('#sidebar-button')?.setAttribute('aria-expanded',String(section==='sidebar'));
 document.querySelector('#rail-settings-button')?.setAttribute('aria-expanded',String(section==='settings'));
}
function refreshRailFromState(){
 const appearanceEl=document.querySelector<HTMLDialogElement>('#appearance');
 if(appearanceEl?.open){setRailSelected('settings');return}
 if(!$('#drawer').hidden){setRailSelected(drawerMode==='library'?'library':'sidebar');return}
 if(homeSplash?.isOpen()){setRailSelected('home');return}
 setRailSelected(null);
}
function syncOpenTabs(){
 if(!doc||tabsEmpty)return;
 const title=doc.title||messages.fUntitledDocument();
 const existing=openTabs.find(t=>t.id===doc.id);
 if(existing)existing.title=title;
 else openTabs.push({id:doc.id,title});
 if(state?.recent?.length){
  for(const t of openTabs){const r=state.recent.find(d=>d.id===t.id);if(r&&t.id!==doc.id)t.title=r.title||messages.fUntitledDocument()}
 }
 saveOpenTabs();
}
function renderTabs(){
 const container=document.querySelector<HTMLElement>('#doc-tabs');
 if(!container||!doc)return;
 syncOpenTabs();
 container.replaceChildren();
 for(const tab of openTabs){
  const active=tab.id===doc.id;
  const pill=node('div','rs-tab-pill'+(active?' active':''));
  pill.setAttribute('role','tab');
  pill.setAttribute('aria-selected',String(active));
  pill.tabIndex=active?0:-1;
  pill.title=active?`${tab.title}（双击重命名）`:tab.title;
  const ic=icon('file-text');ic.classList.add('rs-tab-icon');
  const label=node('span','rs-tab-title',tab.title||messages.fUntitledDocument());
  const closeBtn=node('button','rs-tab-close');
  closeBtn.setAttribute('aria-label','关闭标签页');
  closeBtn.append(icon('close'));
  closeBtn.onclick=e=>{
   e.stopPropagation();
   void closeTab(tab.id);
  };
  pill.onclick=()=>{
   if(homeSplash?.isOpen())homeSplash.closeHome();
   if(tab.id!==doc.id){
    void run(async()=>{if(await saveForAction())load(await call<WorkspaceState>('Activate',tab.id))});
   }
  };
  pill.ondblclick=e=>{
   e.stopPropagation();
   if(tab.id===doc.id)void action('rename',pill);
   else void closeTab(tab.id);
  };
  pill.onkeydown=e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();pill.click()}
  };
  pill.append(ic,label,closeBtn);
  container.append(pill);
 }
}
async function closeTab(id:string){
 if(busy||compositionActive)return;
 const idx=openTabs.findIndex(t=>t.id===id);
 if(idx<0)return;
 const isLast=openTabs.length===1;
 const isActive=id===doc.id;
 const nextTab=!isLast?(openTabs[idx+1]||openTabs[idx-1]):undefined;
 openTabs.splice(idx,1);
 if(isLast)tabsEmpty=true;
 saveOpenTabs();
 if(isLast){
  renderTabs();
  if(isActive)await saveForAction();
  if(!$('#drawer').hidden)closeDrawer();
  homeSplash?.openHome(false);
  setRailSelected('home');
  return;
 }
 if(isActive&&nextTab){
  await run(async()=>{if(await saveForAction())load(await call<WorkspaceState>('Activate',nextTab.id))});
 }else{
  renderTabs();
 }
}
let outlineHeadings:ReturnType<typeof headings>=[],outlineTimer:ReturnType<typeof setTimeout>,outlineFrame=0;
document.documentElement.classList.toggle('windows',windows);
if(desktop){document.body.classList.add('desktop')}
const errorText=localizedError;
function toast(s:string,label='',activate?:()=>void){$('#toast').textContent=s;if(activate){const b=node('button','',label);b.onclick=activate;$('#toast').append(b)}$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200)}
function showNotices(next:WorkspaceState){retainedNotices=next.noticeMessages||next.notices?.map(text=>({text}))||[];banner(retainedNotices.map(noticeText).join('; '),'notice')}
function banner(s='',kind:'error'|'conflict'|'notice'='error'){bannerKind=kind;const bannerEl=$('#banner');bannerEl.dataset.kind=kind;bannerEl.hidden=!s;$('#banner-text').textContent=s;$('#retry-save').hidden=kind!=='error';$('#banner-save-as').hidden=kind==='notice';$('#reload-disk').hidden=kind!=='conflict';$('#overwrite-disk').hidden=kind!=='conflict'}
const split=()=>appearance?.layout==='split';
const reading=()=>appearance?.layout==='read';
function focusContent(){if(reading())$('.preview-scroll').focus();else view.focus()}
function position(){const r=view.state.selection.main;return {anchor:r.anchor,head:r.head,scroll:$('.editor-scroll').scrollTop,source:false}}
function header(){if(!doc)return;const isSplit=split();renderTabs();const current=reading()?'read':isSplit?'split':'single';const cycleBtn=document.querySelector<HTMLButtonElement>('#view-cycle-button');if(cycleBtn){cycleBtn.dataset.viewMode=current;const iconName=current==='read'?'view-read':current==='split'?'view-split':'view-edit';if(cycleBtn.dataset.icon!==iconName){cycleBtn.dataset.icon=iconName;cycleBtn.classList.add('rs-icon-anim');cycleBtn.replaceChildren(icon(iconName))}const curLabel=current==='read'?messages.fRead():current==='split'?messages.fSplit():messages.fEdit();const nextLabel=current==='single'?messages.fSplit():current==='split'?messages.fRead():messages.fEdit();const tip=`${curLabel}（点击切换${nextLabel}）`;cycleBtn.dataset.tip=tip;cycleBtn.setAttribute('aria-label',tip)}updateHeading()}
function updateHeading(){
 const image=!!focusedImageRange(view),cell=!!focusedTableRange(view),active=activeFormats(view.state);
 $<HTMLButtonElement>('#heading-button').disabled=cell||image;
 const undoBtn=$<HTMLButtonElement>('#format-bar [data-action=undo]');if(undoBtn)undoBtn.disabled=undoDepth(view.state)===0;
 const redoBtn=$<HTMLButtonElement>('#format-bar [data-action=redo]');if(redoBtn)redoBtn.disabled=redoDepth(view.state)===0;
 for(const id of ['quote','bullet','ordered','task','indent','outdent']){
  const b=$<HTMLButtonElement>('#format-bar [data-action='+id+']');
  if(b){b.disabled=cell||image||(['indent','outdent'].includes(id)&&!inList(view.state));b.setAttribute('aria-pressed',String(!b.disabled&&active.has(id)))}
 }
 for(const id of [...Object.keys(inlineMarkers),'clearFormatting','link']){
  const b=$<HTMLButtonElement>('#format-bar [data-action='+id+']');
  if(b){b.disabled=image;if(id!=='clearFormatting')b.setAttribute('aria-pressed',String(!image&&active.has(id)))}
 }
 const codeBtn=$<HTMLButtonElement>('#format-bar [data-action=code]');if(codeBtn)codeBtn.setAttribute('aria-pressed',String(active.has('code')));
 const level=headingLevel(view.state),headingValue=level?messages.fHeading(level):messages.fBody();$('#heading-label').textContent=headingValue;
 // The trigger shows the current paragraph style, but its accessible name must also state what it controls.
 $<HTMLButtonElement>('#heading-button').setAttribute('aria-label',messages.fHeadingLevel()+(pageLocale().startsWith('zh')?'：':': ')+headingValue);
 $$('#heading-menu [data-menu-action]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.menuAction===(level?'h'+level:'paragraph'))));
}
// A worker counts; the page counts itself only where no worker runs. The last count is kept with its text, so a language change relabels it at once.
let wordJob=0,wordWorker:Worker|null|undefined,counted:{doc:Text;count:number}|null=null;const wordAsked=new Map<number,Text>();
function showWords(count:number){$('#word-count').textContent=messages.fWordCount(count)}
function wordCounter(){
 if(wordWorker===undefined)try{
  wordWorker=new Worker('stats-worker.js');
  wordWorker.onmessage=(event:MessageEvent<{job:number;count:number}>)=>{const doc=wordAsked.get(event.data.job);wordAsked.delete(event.data.job);if(doc&&event.data.job===wordJob){counted={doc,count:event.data.count};showWords(event.data.count)}};
  wordWorker.onerror=()=>{wordWorker?.terminate();wordWorker=null;wordAsked.clear();scheduleWordCount(true)};
 }catch{wordWorker=null}
 return wordWorker;
}
function scheduleWordCount(immediate=false){
 clearTimeout(wordCountTimer);
 const update=()=>{
  const doc=view.state.doc,job=++wordJob,worker=wordCounter();
  if(counted?.doc===doc)showWords(counted.count);
  else if(worker){wordAsked.set(job,doc);worker.postMessage({job,text:doc.toString()})}
  else{counted={doc,count:countWords(doc.toString())};showWords(counted.count)}
 };
 if(immediate)update();else wordCountTimer=setTimeout(update,400);
}
const AUTO_SAVE_INTERVAL_MS=10000;
let autoSaveTimer:ReturnType<typeof setTimeout>|undefined;
function clearAutoSave(){if(autoSaveTimer!==undefined){clearTimeout(autoSaveTimer);autoSaveTimer=undefined}}
function scheduleAutoSave(){if(compositionActive||isImageDragging(view)||autoSaveTimer!==undefined)return;autoSaveTimer=setTimeout(()=>{autoSaveTimer=undefined;if(isImageDragging(view)){scheduleAutoSave();return}void save()},AUTO_SAVE_INTERVAL_MS)}
function changed(content=true){
 if(loading||!doc)return;
 updateHeading();
 const curLine=view.state.doc.lineAt(view.state.selection.main.head).number;
 if(content){dirty=true;generation++;if(!isImageDragging(view)){sidebarSearch?.contentPending();scheduleWordCount()}header()}
 documentFind?.changed(content);
 preview.changed(content,curLine-1);
 if(content){if(!isImageDragging(view))scheduleOutline()}else scheduleOutlineLayout();
 if(!compositionActive&&!isImageDragging(view))scheduleAutoSave()
}
function composition(active:boolean){if(active)navigationEpoch++;compositionActive=active;preview.composition(active);if(active){clearTimeout(outlineTimer);clearAutoSave()}else{scheduleOutline();scheduleAutoSave();if(pendingClose){pendingClose=false;void closeApp()}}}
// force: an explicit save or retry resends the content so a failed file write is retried.
async function save(force=false):Promise<boolean>{
 clearAutoSave();if(compositionActive)return false;if(saveFlight){const pending=await saveFlight;if(!pending&&dirty)return false;if(dirty||force)return save(force);return true}if(!doc||!view)return true;
 const pos=position();if(!force&&!dirty&&JSON.stringify(pos)===savedPosition)return true;
 const id=doc.id,stamp=generation,positionOnly=!dirty&&!force,content=positionOnly?'':view.state.doc.toString();
 saveFlight=(async()=>{try{
  if(positionOnly){await call('SavePosition',id,pos);if(doc.id===id){doc.position=pos;savedPosition=JSON.stringify(pos)}return true}
  const result=await call<Doc>('Update',{id,revision:doc.revision,content,position:pos});
  if(doc.id!==id)return true;doc.revision=result.revision;doc.status=result.status;doc.statusCode=result.statusCode;failedSaveError=undefined;doc.conflict=result.conflict;doc.title=result.title;doc.customTitle=result.customTitle;doc.content=content;doc.position=pos;doc.updated=result.updated;
  if(stamp===generation)dirty=false;savedPosition=JSON.stringify(pos);header();preview.saved();sidebarSearch?.contentAccepted(dirty);
  if(result.conflict||statusFailed(result))banner(statusText(result),result.conflict?'conflict':'error');else banner();return true;
 }catch(e){if(positionOnly)return true;failedSaveError=e;banner(messages.fSaveError(errorText(e)),'error');dirty=true;sidebarSearch?.contentFailed();return false}finally{saveFlight=null}})();const ok=await saveFlight;if(ok&&dirty)return save();return ok;
}
async function saveForAction(){const ok=await save();if(!ok&&dirty){toast(messages.fTrySavingAgainYourTextIsStillHere());return false}await appearanceQueue.catch(()=>{});return true}
async function resolveImageFor(documentID:string,dest:string):Promise<string>{
 if(/^https?:\/\//.test(dest))return dest;
 const key=imageKey(documentID,dest);if(!imageCache.has(key))imageCache.set(key,call<ImageResult>('ReadImage',documentID,dest).then(x=>x.url).catch(e=>{imageCache.delete(key);throw e}));return imageCache.get(key)!;
}
const resolveImage=(dest:string)=>resolveImageFor(doc.id,dest);
function locateSearch(hit:SearchHit){
 previewSmoothScroll?.cancel();
 view.dispatch({selection:{anchor:hit.from,head:hit.to},effects:EditorView.scrollIntoView(hit.from,{y:'center'}),annotations:Transaction.addToHistory.of(false)});
 if(split()||reading())preview.jumpToLine(hit.line-1);
}
function loadNewDocument(next:WorkspaceState){
 if(appearance&&appearance.layout!=='single')void setAppearance({layout:'single'});
 else if(!appearance)pendingAppearance={...pendingAppearance,layout:'single'};
 load(next);
}
function validCurrentSearchTarget(item:SearchItem,hit:SearchHit|undefined){
 return !dirty&&!compositionActive&&!view.composing&&validSearchTarget(item,hit,{id:doc.id,revision:doc.revision,content:view.state.doc.toString()});
}
function load(next:WorkspaceState,hit?:SearchHit,preserveEmptyTabs=false){
 previewSmoothScroll?.cancel();
 if(!preserveEmptyTabs){
  tabsEmpty=false;
  if(homeSplash?.isOpen())homeSplash.closeHome();
 }
 const epoch=++navigationEpoch;
 loading=true;if(view){sessions.set(doc.id,view.state);view.destroy()}
 if(!appearance)appearance={...next.appearance,...pendingAppearance};next.appearance=appearance;pendingAppearance=null;
 state=next;doc=next.current;dirty=false;generation=0;savedPosition=JSON.stringify(doc.position);
 view=createEditor($('#editor'),doc,resolveImage,changed,insertImages,composition,openLink,files=>{if(files[0])void importFile(files[0])},importPastedImage,error=>toast(errorText(error)),{action:id=>void action(id==='image'?id:'block:'+id),dispatch:spec=>{if(!compositionActive&&!view.state.readOnly)view.dispatch(spec);view.focus()}},()=>appearance?.autoSpace!==false,{onEdit:pos=>{if(view.state.readOnly)return;view.dispatch({selection:{anchor:pos}});if(linkAt(view.state))openLinkEditor();else view.focus()},resolveWiki:async target=>{const local=state?.recent?.find(item=>(item.title||'').trim().toLowerCase()===target.trim().toLowerCase());if(local)return {title:local.title,excerpt:local.excerpt};try{const res=await call<SearchResponse>('ResolveWikiLink',{sourceID:doc.id,revision:doc.revision,target} satisfies WikiResolveRequest);const hit=res.items?.[0];if(hit)return {title:hit.title,excerpt:hit.hits?.[0]?.text||hit.path}}catch{}return null}});
 // Top margin is the breathing room kept below the format bar when scrolling targets into view. It must stay below the first line's height above the scroller (about 19px at the 16px minimum font size), or hover tooltips anchored on the document's first line are measured as hidden and parked off-screen by CodeMirror.
 view.dispatch({effects:StateEffect.appendConfig.of([editLock.of(EditorState.readOnly.of(false)),EditorView.scrollMargins.of(()=>({top:12}))])});
 const cached=sessions.get(doc.id);if(cached&&cached.doc.toString()===doc.content){view.setState(cached)}
 // Reading layout keeps the editor editable-state (it is visibility:hidden, pointer-events:none and focus moves to the preview): flipping readOnly swaps widget DOM (e.g. table cell line boxes) and corrupts CodeMirror's cached height map for off-viewport blocks, so the document jumped on return.
 view.dispatch({effects:[editLock.reconfigure(EditorState.readOnly.of(busy))]});
 loading=false;applyTheme();const changedPreviewDocument=preview.setDocument(doc.id);applyLayout();if(!changedPreviewDocument)preview.refresh();header();scheduleWordCount(true);scheduleOutline(true);if(doc.conflict||statusFailed(doc))banner(statusText(doc),doc.conflict?'conflict':'error');else banner();
 const loadedView=view,loadedID=doc.id,loadedGeneration=generation,scroll=doc.position.scroll||0;
 requestAnimationFrame(()=>{
  if(view!==loadedView||doc.id!==loadedID||epoch!==navigationEpoch||compositionActive||hit&&generation!==loadedGeneration)return;
  $('.editor-scroll').scrollTop=scroll;if(split())splitScroll?.syncNow('editor');if(!homeSplash?.isOpen()){focusContent();if(hit)locateSearch(hit)}
 });
 sidebarSearch?.contentAccepted();
 folderTree?.render();
 homeSplash?.updateRecent(next.recent);
 if(!$('#drawer').hidden)renderDrawer();
}
async function refreshRecent(){await appearanceQueue.catch(()=>{});const next=await call<WorkspaceState>('State');next.appearance=appearance;state=next;homeSplash?.updateRecent(next.recent);renderDrawer();sidebarSearch?.refresh();if(next.notices?.length)showNotices(next)}
function themeID():ThemeID{return resolveTheme(appearance,new Date(),mq.matches)}
// An automatic switch that stays light or stays dark fades the large surfaces into the new theme (.theme-fade in style.css).
// Across schemes it paints at once: text colours flip instantly, so a fading background would leave text unreadable for a moment. Manual changes paint at once too.
let fadeTimer:ReturnType<typeof setTimeout>;
function themeFade(on:boolean){clearTimeout(fadeTimer);document.documentElement.classList.toggle('theme-fade',on);if(on)fadeTimer=setTimeout(()=>document.documentElement.classList.remove('theme-fade'),1100)}
function applyTheme(){if(!appearance)return;paintTheme(document.documentElement,themeID());document.documentElement.style.setProperty('--editor-size',(appearance.fontSize||18)+'px');document.documentElement.style.setProperty('--paper-width',appearance.lineWidth==='full'?'100%':appearance.lineWidth==='wide'?'920px':'760px');appearanceDialog.render();syncDrawer();scheduleOutlineLayout()}
function applyLayout(){
 cancelLayoutScroll();
 previewSmoothScroll?.cancel();
 const scrollEl=$('.editor-scroll');
 const currentView=view,selection=view.state.selection;
 const controller=new AbortController();
 cancelLayoutScroll=()=>controller.abort();
 for(const event of ['wheel','pointerdown','keydown'])scrollEl.addEventListener(event,cancelLayoutScroll,{passive:true,capture:true,signal:controller.signal});
 const scroll=scrollEl.scrollTop,beforeHeight=scrollEl.clientHeight,wasRead=$('.desk').classList.contains('read-layout'),wasSplit=$('.desk').classList.contains('split-layout');
 $('.desk').classList.toggle('split-layout',split());
 $('.desk').classList.toggle('read-layout',reading());
 $('#format-bar').hidden=reading();
 preview.setVisible(split()||reading());
 view.dispatch({effects:[editLock.reconfigure(EditorState.readOnly.of(busy))]});
 if(reading()&&!wasRead)$('.preview-scroll').focus();
 header();
 documentFind?.refresh();
 requestAnimationFrame(()=>{
  // Hiding the format bar in reading view makes the scroller 1 bar taller; shift scroll by the same delta so the viewed line stays put (clamped at both ends).
  // A later navigation or gesture owns the viewport; the old frame must not
  // restore the previous position over Home, a table click or a manual scroll.
  if(!controller.signal.aborted&&view===currentView&&view.state.selection.eq(selection)){
   const target=scroll-(scrollEl.clientHeight-beforeHeight);
   scrollEl.scrollTop=Math.max(0,Math.min(target,scrollEl.scrollHeight-scrollEl.clientHeight));
  }
  controller.abort();
  if(split()&&!wasSplit)splitScroll?.syncNow(wasRead?'preview':'editor');
  scheduleOutlineLayout();
 });
}
function applyAppearance(next:Appearance){
 cancelTypographyScroll();
 const typography=next.fontSize!==appearance.fontSize||next.lineWidth!==appearance.lineWidth;
 const apply=()=>{appearance=next;state.appearance=next;themeFade(false);applyTheme()};
 if(!typography){apply();return}
 const repaint=()=>preview.preserveScroll(apply);
 if(reading())repaint();else cancelTypographyScroll=preserveEditorScroll(view,$('.editor-scroll'),repaint);
}
async function setAppearance(change:Partial<Appearance>){
 applyAppearance({...appearance,...change});
 try{const pending=appearanceQueue.catch(()=>{}).then(async()=>{await call('UpdateAppearance',change);try{localStorage.setItem('readsoul-appearance',JSON.stringify(appearance))}catch{}});appearanceQueue=pending;await pending}catch(e){toast(messages.fPreferencesError(errorText(e)))}
}
// The caption under each row names the theme under the pointer or focus, else the one in use.
const appearanceDialog=appearanceSettings(()=>appearance,themeID,setAppearance);
watchTheme(()=>{if(!appearance)return;const from=document.documentElement.dataset.readsoulTheme||'',to=themeID();if(from===to)return;themeFade(!reducedMotion.matches&&isDark(from)===isDark(to));applyTheme()});
const triggers=new Map<string,HTMLElement>();
function dialog(id:string,trigger?:HTMLElement){
 const origin=trigger??document.activeElement;
 if(origin instanceof HTMLElement)triggers.set(id,origin);
 $<HTMLDialogElement>('#'+id).showModal();
}
const wikiChooser=createWikiChooser($<HTMLDialogElement>('#wiki-dialog'),$('#wiki-candidates'),()=>dialog('wiki-dialog'));
function closeDialog(id:string){$<HTMLDialogElement>('#'+id).close();triggers.get(id)?.focus()}
function validateDraftName(){const input=$<HTMLInputElement>('#rename-input');input.setCustomValidity(input.value.trim()?'':messages.bNameRequired())}
$$('[data-close]').forEach(b=>b.onclick=()=>{const id=b.dataset.close!;if(id==='drawer'){closeDrawer();$('#sidebar-button').focus()}else closeDialog(id)});
$$('dialog').forEach(el=>{const d=el as HTMLDialogElement;d.addEventListener('close',()=>triggers.get(d.id)?.focus());d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeDialog(d.id)})});
function renderDrawer(){if(sidebarSearch)sidebarSearch.renderRecent();else renderRecent()}
function renderRecent(selected=''){
 const active=document.activeElement as HTMLElement|null;
 const focusedRemove=active?.dataset.remove,focusedKey=active?.dataset.searchKey;
 const list=$('#drawer-list');list.replaceChildren();
 for(const d of state.recent){const b=node('button','recent-item'+(d.id===doc.id?' active':''));b.dataset.searchKey=d.id+':recent';b.append(node('b','',d.title||messages.fUntitledDocument()),node('p','',d.excerpt||messages.fADocumentWaitingToBegin()),node('small','',new Date(d.updated).toLocaleString(pageLocale(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})));b.onclick=()=>void run(async()=>{if(homeSplash?.isOpen())homeSplash.closeHome();if(await saveForAction()){load(await call<WorkspaceState>('Activate',d.id));closeOverlayDrawer()}});
  const armed=removeID===d.id&&Date.now()<removeUntil,row=node('div','recent-row'),body=node('div','recent-body'),remove=node('button','recent-remove'+(armed?' armed':''),armed?messages.fConfirmRemoval():'×');remove.dataset.remove=d.id;const removeLabel=armed?messages.fConfirmRemoval():messages.fRemoveFromRecentDocuments();remove.setAttribute('aria-label',removeLabel);remove.dataset.tip=removeLabel;remove.onclick=()=>confirmRemove(d.id);
  body.append(b);if(d.tags?.length){const tags=node('div','document-tags');tags.append(tagButtons(d.tags,selected,tag=>sidebarSearch.chooseTag(tag),d.id));body.append(tags)}row.append(body,remove);list.append(row);if(focusedRemove===d.id)remove.focus()
 }
 if(!list.childElementCount)list.append(node('p','dialog-note',messages.fNoDocumentsFound()))
 if(focusedKey){const target=Array.from(list.querySelectorAll<HTMLElement>('[data-search-key]')).find(b=>b.dataset.searchKey===focusedKey);(target||$('#recent-search')).focus()}
}
async function navigateSearch(item:SearchItem,hit?:SearchHit){
 if(compositionActive||view?.composing){toast(messages.fFinishComposingYourTextFirst());return}
 if(busy)return;
 const originView=view,originID=doc.id,epoch=++navigationEpoch;
 const canContinue=()=>{
  if(view!==originView||doc.id!==originID)return false;
  if(compositionActive||view.composing){toast(messages.fFinishComposingYourTextFirst());return false}
  if(epoch!==navigationEpoch)return false;
  if(dirty){toast(messages.fTrySavingAgainYourTextIsStillHere());return false}
  return true;
 };
 await run(async()=>{
  if(!await saveForAction()||!canContinue())return;
  let next:WorkspaceState;
  try{next=await call<WorkspaceState>('ActivateSearch',item.id)}catch(error){
   sidebarSearch.refresh();
   if(localizedError(error)===messages.bDocumentMissing()){state.recent=state.recent.filter(d=>d.id!==item.id);toast(messages.fSearchRemoved())}
   else toast(errorText(error));
   return;
  }
  if(!canContinue()){
   if(view===originView&&doc.id===originID){
    const restored=await call<WorkspaceState>('ActivateSearch',originID);
    state=restored;state.current=doc;state.appearance=appearance;renderDrawer();
   }
   return;
  }
  if(homeSplash?.isOpen())homeSplash.closeHome();
  const valid=validSearchTarget(item,hit,next.current),same=doc.id===next.current.id&&view.state.doc.toString()===next.current.content;
  if(!same)load(next,valid?hit:undefined);
  else{
   state=next;doc=next.current;header();
   if(valid){const selectedView=view,stamp=navigationEpoch;requestAnimationFrame(()=>{if(view===selectedView&&navigationEpoch===stamp&&validCurrentSearchTarget(item,hit)){focusContent();if(hit)locateSearch(hit)}})}
  }
  if(!valid){toast(messages.fSearchStale());sidebarSearch.refresh()}
  closeOverlayDrawer();
 });
}
function confirmRemove(id:string,command=false){
 if(busy)return;if(compositionActive){toast(messages.fFinishComposingYourTextFirst());return}
 if(removeID===id&&Date.now()<removeUntil){clearTimeout(removeTimer);removeID='';void run(async()=>{try{await removeDocument(id)}finally{if(!$('#drawer').hidden)renderDrawer()}});return}
 clearTimeout(removeTimer);removeID=id;removeUntil=Date.now()+3000;if(!$('#drawer').hidden)renderDrawer();
 removeTimer=setTimeout(()=>{removeID='';if(!$('#drawer').hidden)renderDrawer()},3000);
 if(command)toast(messages.fChooseAgainWithin3SecondsToRemove())
}
async function removeDocument(id:string){
 const removed=state.recent.find(d=>d.id===id);if(!removed)return;
 if(id===doc.id&&!await saveForAction())return;
 openTabs=openTabs.filter(t=>t.id!==id);saveOpenTabs();
 const next=await call<WorkspaceState>('Delete',id);next.appearance=appearance;
 if(next.current.id!==doc.id)load(next);else{state=next;renderTabs()}
 sessions.delete(id);for(const key of imageCache.keys())if(key.startsWith(id+':'))imageCache.delete(key);
 sidebarSearch?.refresh();renderDrawer();toast(removed.path?messages.fRemovedFromRecentDocumentsTheFileIsUnchanged():messages.fRemovedTheDraftStaysInTheTrashFolderFor())
}
let sidebarRequestedInHome=false;
function syncDrawer(){
 const dockedWanted=dockQuery.matches&&!!appearance?.sidebarDocked;
 const allowOpen=!homeSplash?.isOpen()||sidebarRequestedInHome;
 const open=(dockQuery.matches?dockedWanted:overlayOpen)&&allowOpen,wasHidden=$('#drawer').hidden;
 const historyView=document.querySelector<HTMLElement>('#drawer-history-view');
 const libraryView=document.querySelector<HTMLElement>('#drawer-library-view');
 if(historyView)historyView.hidden=drawerMode!=='history';
 if(libraryView)libraryView.hidden=drawerMode!=='library';
 $('.workspace').classList.toggle('sidebar-docked',dockQuery.matches&&open);
 $('#drawer').hidden=!open;$('#drawer').inert=!open;
 refreshRailFromState();
 sidebarSearch?.visible(open&&drawerMode==='history');
 if(open&&wasHidden&&view){
  if(drawerMode==='history')renderDrawer();
  else void folderTree?.refresh();
 }
 scheduleOutlineLayout();
}
function closeDrawer(){sidebarRequestedInHome=false;if(dockQuery.matches)void setAppearance({sidebarDocked:false});else{overlayOpen=false;syncDrawer()}}
function closeOverlayDrawer(){if(!dockQuery.matches)closeDrawer()}
async function openDrawer(mode:'history'|'library'='history'){
 drawerMode=mode;
 const appearanceEl=document.querySelector<HTMLDialogElement>('#appearance');
 if(appearanceEl?.open)closeDialog('appearance');
 if(homeSplash?.isOpen())sidebarRequestedInHome=true;
 if(dockQuery.matches){
  if(!appearance.sidebarDocked)void setAppearance({sidebarDocked:true});
  else syncDrawer();
 }else{
  overlayOpen=true;
  syncDrawer();
 }
 if(mode==='history'){
  renderDrawer();
  await refreshRecent();
 }else{
  await folderTree?.refresh();
 }
}
dockQuery.addEventListener('change',()=>{overlayOpen=false;syncDrawer();if($('#drawer').hidden&&$('#drawer').contains(document.activeElement)&&view)focusContent()});
document.addEventListener('pointerdown',e=>{const t=e.target as Element|null;if(!$('#drawer').hidden&&!$('#drawer').contains(t)&&!$('#sidebar-button').contains(t)&&!$('#library-button')?.contains(t)&&!t?.closest('#fs-prompt-dialog,#global-search-dialog'))closeOverlayDrawer()});
$('#sidebar-button').onclick=()=>{if(!$('#drawer').hidden&&drawerMode==='history')closeDrawer();else void openDrawer('history')};
document.querySelector<HTMLButtonElement>('#library-button')?.addEventListener('click',()=>{
 if(!$('#drawer').hidden&&drawerMode==='library')closeDrawer();
 else void openDrawer('library');
});
 (()=>{
  try{
   const savedWidth=Number(localStorage.getItem('readsoul-sidebar-width'));
   if(savedWidth>=180&&savedWidth<=460)document.documentElement.style.setProperty('--rs-sidebar-width',`${savedWidth}px`);
   const savedAvatar=localStorage.getItem('readsoul-user-avatar');
   const avatarImg=document.querySelector<HTMLImageElement>('#rs-avatar-img');
   const avatarFallback=document.querySelector<HTMLElement>('#rs-avatar-fallback');
   if(savedAvatar&&avatarImg&&avatarFallback){avatarImg.src=savedAvatar;avatarImg.hidden=false;avatarFallback.hidden=true}
  }catch{}
  const avatarBtn=document.querySelector<HTMLButtonElement>('#rs-avatar-button');
  const avatarInput=document.querySelector<HTMLInputElement>('#rs-avatar-input');
  if(avatarBtn&&avatarInput){
   avatarBtn.onclick=()=>avatarInput.click();
   avatarInput.onchange=()=>{
    const file=avatarInput.files?.[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
     if(typeof reader.result==='string'){
      try{localStorage.setItem('readsoul-user-avatar',reader.result)}catch{}
      const avatarImg=document.querySelector<HTMLImageElement>('#rs-avatar-img');
      const avatarFallback=document.querySelector<HTMLElement>('#rs-avatar-fallback');
      if(avatarImg&&avatarFallback){avatarImg.src=reader.result;avatarImg.hidden=false;avatarFallback.hidden=true}
     }
    };
    reader.readAsDataURL(file);
    avatarInput.value='';
   };
  }
  const resizer=document.querySelector<HTMLElement>('#drawer-resizer');
  if(resizer){
   resizer.addEventListener('pointerdown',e=>{
    e.preventDefault();
    const drawer=$('#drawer');
    const workspace=$('.workspace');
    workspace.classList.add('is-resizing');
    const startX=e.clientX,startW=drawer.getBoundingClientRect().width;
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
    const onMove=(ev:PointerEvent)=>{
     const nextW=Math.max(180,Math.min(460,Math.round(startW+(ev.clientX-startX))));
     document.documentElement.style.setProperty('--rs-sidebar-width',`${nextW}px`);
     try{localStorage.setItem('readsoul-sidebar-width',String(nextW))}catch{}
     scheduleOutlineLayout();
    };
    const onUp=()=>{
     workspace.classList.remove('is-resizing');
     document.body.style.cursor='';
     document.body.style.userSelect='';
     window.removeEventListener('pointermove',onMove);
     window.removeEventListener('pointerup',onUp);
    };
    window.addEventListener('pointermove',onMove);
    window.addEventListener('pointerup',onUp);
   });
  }
  const appearanceEl=document.querySelector<HTMLDialogElement>('#appearance');
  if(appearanceEl){
   appearanceEl.addEventListener('close',()=>refreshRailFromState());
  }
  const minBtn=document.querySelector<HTMLButtonElement>('#win-minimize');
  const maxBtn=document.querySelector<HTMLButtonElement>('#win-maximize');
  const closeBtn=document.querySelector<HTMLButtonElement>('#win-close');
  let winMaximized=false;
  const syncMaxBtn=(max:boolean)=>{
   winMaximized=max;
   if(!maxBtn)return;
   maxBtn.dataset.icon=max?'restore':'square';
   maxBtn.replaceChildren(icon(maxBtn.dataset.icon));
   const label=max?'向下还原':'最大化';
   maxBtn.setAttribute('aria-label',label);
   maxBtn.dataset.tip=label;
  };
  if(isTauri()){
   const win=getCurrentWindow();
   const updateMax=()=>void win.isMaximized().then(syncMaxBtn).catch(()=>{});
   void win.onResized(()=>updateMax()).then(()=>updateMax()).catch(()=>{});
   if(minBtn)minBtn.onclick=()=>void win.minimize();
   if(maxBtn)maxBtn.onclick=()=>void win.toggleMaximize();
   if(closeBtn)closeBtn.onclick=()=>void closeApp();
  }else{
   if(minBtn)minBtn.onclick=()=>toast('窗口最小化（桌面端生效）');
   if(maxBtn)maxBtn.onclick=()=>syncMaxBtn(!winMaximized);
   if(closeBtn)closeBtn.onclick=()=>void closeApp();
  }
 })();
async function setView(layout:Appearance['layout']){
 if(!view||busy)return;if(compositionActive){toast(messages.fFinishComposingYourTextFirst());return}
 if(layout==='read'&&!reading()){layoutBeforeRead=appearance.layout}
 const before=document.activeElement;const pending=setAppearance({layout});applyLayout();await pending;
 // Move focus to the content only if nothing else took it while the layout was saved (e.g. a menu the user opened).
 if(document.activeElement===before||document.activeElement===document.body)focusContent();
}
async function toggleLayout(){await setView(split()?'single':'split')}
async function toggleRead(){await setView(reading()?layoutBeforeRead||'single':'read')}
const viewCycleBtn=document.querySelector<HTMLButtonElement>('#view-cycle-button');
if(viewCycleBtn){
 viewCycleBtn.onclick=()=>{
  const cur=reading()?'read':split()?'split':'single';
  const next:Appearance['layout']=cur==='single'?'split':cur==='split'?'read':'single';
  void setView(next);
 };
}
async function importImage(file:File,id:string):Promise<ImageResult>{
 if(file.size>20*1024*1024)throw Error(messages.fTheImageExceeds20MB());
 const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error(messages.fTheImageCouldNotBeRead()));r.readAsDataURL(file)});
 const image=await call<ImageResult>('ImportImage',id,file.name,data);
 if(doc.id!==id)throw Error(messages.fTheDocumentChangedInsertTheImageAgain());
 imageCache.set(imageKey(id,image.destination),Promise.resolve(image.url));return image;
}
async function importPastedImage(image:PasteImage):Promise<string>{
 const id=doc.id;setBusy(true);
 try{
  if(image.dataUrl.length>28*1024*1024)throw Error(messages.fTheImageExceeds20MB());
  const blob=dataUrlBlob(image.dataUrl);
  const imported=await importImage(new File([blob],messages.fPastedImage(),{type:blob.type}),id);
  const alt=image.alt.replace(/[\[\]\\]/g,'\\$&').replace(/[\r\n]/g,' ');
  return `![${alt}](${imported.markdown})`;
 }finally{setBusy(false)}
}
async function insertImages(files:File[],at?:number){
 if(reading()){toast(messages.fEditingIsUnavailableInReadingModePressRTo(keyLabel('Mod+Shift+R')));return}if(busy||!doc||compositionActive)return;const id=doc.id;let offset=at??focusedImageRange(view)?.to??view.state.selection.main.from;setBusy(true);
 try{for(const file of files){const image=await importImage(file,id);const alt=file.name.replace(/[\[\]\\\r\n]/g,'').replace(/\.[^.]+$/,'')||messages.fImage();const curLine=view.state.doc.lineAt(offset);const inTextLine=curLine.text.trim().length>0&&!/^\s*#/.test(curLine.text);const col=Math.max(200,view.contentDOM.getBoundingClientRect().width||560);let text:string;if(inTextLine){text=serializeImage({src:image.markdown,alt,align:'right',wrap:'float',width:defaultWrapWidth(col)},true)}else{const before=view.state.sliceDoc(Math.max(0,offset-2),offset);const after=view.state.sliceDoc(offset,Math.min(view.state.doc.length,offset+2));const lead=offset===0||before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n';const trail=after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n';text=`${lead}${serializeImage({src:image.markdown,alt,align:'right',wrap:'float',width:defaultWrapWidth(col)},false)}${trail}`}view.dispatch({changes:{from:offset,insert:text},selection:{anchor:offset+text.length},userEvent:'input.paste'});offset+=text.length}await save();view.focus()}catch(e){toast(errorText(e))}finally{setBusy(false)}
}
$('#image-input').onchange=()=>{const input=$<HTMLInputElement>('#image-input');void insertImages(Array.from(input.files||[]));input.value=''};
function setBusy(value:boolean){busy=value;if(view)view.dispatch({effects:editLock.reconfigure(EditorState.readOnly.of(value))});if(!value&&pendingClose){pendingClose=false;void closeApp()}}
async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);try{await fn()}catch(e){toast(errorText(e))}finally{setBusy(false)}}
async function saveAs(){
 if(!await saveForAction()){await rescue();return;}
 const raw=view.state.doc.toString();
 const standard=$<HTMLInputElement>('#delivery-standard-md')?.checked;
 const text=standard?(await import('./delivery')).toStandardMarkdown(raw):raw;
 download(doc.title+'.md',text,'text/markdown');
 toast(messages.fMarkdownDownloadedUseExportToIncludeImages());
}
async function rescue(){
 download(messages.fRecoveryFilename(doc.title),view.state.doc.toString(),'text/markdown');toast(messages.fTextDownloadedImagesRemainOnThisMac());
}
function download(name:string,data:BlobPart,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function exportDoc(allowMissing=false){
 if(!await saveForAction())return;
 const data=await call<Delivery>('Delivery',doc.id);
 if(data.missing?.length&&!allowMissing){pendingMissing=()=>exportDoc(true);$('#missing-list').textContent=data.missing.join('\n');dialog('missing-dialog');return}
 const standard=!!$<HTMLInputElement>('#delivery-standard-md')?.checked;
 const {buildDeliveryZip}=await import('./delivery');
 const zip=buildDeliveryZip(data,doc.title,standard);
 download((doc.title||'document')+'.zip',zip as BlobPart,'application/zip');
 toast(messages.fDocumentArchiveDownloaded()+(data.missing?.length?messages.fMissingImageReferencesPreserved():'')+(data.external?messages.fExternalImagesNeedAnInternetConnection():''));
}
$('#export-anyway').onclick=()=>{closeDialog('missing-dialog');void run(pendingMissing)};
async function prepareDelivery(kind:string,allowMissing=false){
 if(!await saveForAction())return;const data=await call<Delivery>('Delivery',doc.id);
 if(data.missing.length&&!allowMissing){pendingMissing=()=>prepareDelivery(kind,true);$('#missing-list').textContent=data.missing.join('\n');dialog('missing-dialog');return}
 const {renderDelivery,waitImages,prepareRichClipboard}=await import('./delivery');
 if(prepared)disposeMermaid(prepared);
 prepared=renderDelivery(data,kind==='pdf'?'htmlAndMathml':'mathml');$('#print-document').replaceChildren(prepared);await waitImages(prepared);await document.fonts.ready;
 readyClipboard=kind==='copyRich'?await prepareRichClipboard(prepared):null;readyAction=kind;
 readyData=data;renderReadyInfo();dialog('ready-dialog');
}
function renderReadyInfo(){if(!readyData)return;
 $('#ready-info').textContent=(readyAction==='pdf'?messages.fExportTheCompleteFormattedDocument():readyAction==='copyRich'?messages.fCopyTheTextAndBasicFormatting():readyAction==='docx'?messages.fWordDescription():messages.fDownloadHTMLWithLocalImagesEmbedded())+(readyData.missing.length?messages.fMissingImagesWillShowANote():'')+(readyData.external?messages.fExternalImagesRemainAsLinks():'');
 $('#ready-go').textContent=readyAction==='copyRich'?messages.fCopyRichText():readyAction==='pdf'?messages.fPrintSaveAsPDF():readyAction==='docx'?messages.fDownloadWordDocument():messages.fDownloadHTML();
}
$('#ready-go').onclick=()=>{if(!prepared)return;const root=prepared;
 if(readyAction==='copyRich'){
  if(!readyClipboard)return;
  void import('./delivery').then(({copyRich})=>copyRich(readyClipboard!)).then(()=>{closeDialog('ready-dialog');toast(messages.fRichTextCopiedImageSupportDependsOnTheReceiving())}).catch(e=>toast(errorText(e)));return;
 }
 closeDialog('ready-dialog');
 if(readyAction==='html'){const html='<!doctype html><html lang="'+pageLocale()+'"><meta charset="utf-8"><title>'+doc.title.replace(/[<>&]/g,'')+'</title><body>'+root.outerHTML+'</body></html>';download(doc.title+'.html',html,'text/html');return}
 if(readyAction==='docx'){const title=readyData?.title||doc.title,snapshot=root.cloneNode(true) as HTMLElement;void run(async()=>{
  const {exportDOCX}=await import('./docx-export'),bytes=await exportDOCX(snapshot,title,'zh-CN');
  download(title+'.docx',bytes as BlobPart,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 });return}
 document.body.classList.add('printing');
 window.print();document.body.classList.remove('printing');
};
async function closeApp(){if(compositionActive){pendingClose=true;toast(messages.fFinishComposingYourTextToSaveAndQuit());return}if(busy){pendingClose=true;return}if(closeRequested)return;closeRequested=true;try{await appearanceQueue.catch(()=>{});const ok=await save();if(!ok||dirty){dialog('close-dialog');return}if(isTauri())await getCurrentWindow().destroy();else toast(messages.fYourDocumentIsSavedLocallyYouCanCloseThis())}finally{closeRequested=false}}
$('#discard-close').onclick=()=>{if(isTauri())void getCurrentWindow().destroy();else closeDialog('close-dialog')};
async function action(id:string,trigger?:HTMLElement){
 if(id==='undo'||id==='redo'){const el=document.activeElement;if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){document.execCommand(id);return}}
 if(!view||!doc)return;
 if(reading()&&(id in inlineMarkers||id==='clearFormatting'||id==='indent'||id==='outdent'||id==='insert'||['paragraph','h1','h2','h3','h4','h5','h6','strike','inlineCode','heading','quote','bullet','ordered','task','bold','italic','code','math','mermaid','footnote','details','link','table','image','pastePlain','undo','redo'].includes(id))){toast(messages.fEditingIsUnavailableInReadingModePressRTo(keyLabel('Mod+Shift+R')));return}
 if(busy){if(id==='close')pendingClose=true;return;}
 if(compositionActive&&id!=='close'){toast(messages.fFinishComposingYourTextFirst());return}
 const imageRange=focusedImageRange(view),cellRange=imageRange||focusedTableRange(view);
 if(imageRange&&(id in inlineMarkers||['clearFormatting','link'].includes(id)))return;
 if(cellRange){
  if(id==='footnote'&&!imageRange){const spec=tableFootnote(view)?.();if(spec)view.dispatch(spec);view.focus();return}
  if(id==='math'&&!imageRange){formatTableCell(view,id);return}
  if(id in inlineMarkers||id==='clearFormatting'||id==='link'){formatTableCell(view,id);return}
  if(['paragraph','h1','h2','h3','h4','h5','h6','heading','quote','bullet','ordered','task','indent','outdent'].includes(id))return;
  if(['image','table','code','math','mermaid','details','footnote'].includes(id)){
   view.dispatch(insertToolbarItem(view.state,id as SlashItemID,cellRange));
   if(id==='image'){view.focus();$('#image-input').click()}else if(id!=='table'||!focusTableCell(view))view.focus();return;
  }
 }
 if(id==='insert'){insertMenu.open();return}
 if(id==='clearFormatting'){view.dispatch(clearFormatting(view.state));view.focus();return}
 if(id==='indent'||id==='outdent'){const spec=indentList(view.state,id==='indent'?1:-1);if(spec)view.dispatch(spec);view.focus();return}
 if(id.startsWith('block:')){
  if(view.state.readOnly||compositionActive)return;
  const control=blockControls(view),name=id.slice(6);if(name==='menu'){control?.open();return}
  const range=control?.range||blockAt(view.state,view.state.selection.main.head);if(!range)return;
  if(name==='insert'){view.dispatch(insertParagraphBelow(view.state,range));openSlashMenu(view);return}
  const spec=name==='up'||name==='down'?moveBlocks(view.state,range,name==='up'?-1:1):name==='duplicate'?duplicateBlocks(view.state,range):name==='delete'?deleteBlocks(view.state,range):convertBlocks(view.state,range,name as BlockConversion);
  if(spec)view.dispatch(spec);view.focus();return;
 }
 if(['paragraph','h1','h2','h3','h4','h5','h6'].includes(id)){view.dispatch(setHeading(view.state,id==='paragraph'?0:Number(id.slice(1))));view.focus();return}
 if(['heading','quote','bullet','ordered','task'].includes(id)){view.dispatch(blockFormat(view.state,id as BlockKind));view.focus();return}
 if(id in inlineMarkers){view.dispatch(wrapSelection(view.state,...inlineMarkers[id]));view.focus();return}
 if(id==='pastePlain'){
  const target=view;
  try{const text=await navigator.clipboard.readText();if(view!==target||view.state.readOnly||reading()||compositionActive)return;view.dispatch(pasteText(view.state,text));view.focus()}catch(error){toast(messages.fClipboardError(errorText(error)))}return;
 }
 if(id==='footnote'){view.dispatch(insertFootnote(view.state));view.focus();return}
 if(id==='details'){view.dispatch(insertToolbarItem(view.state,'details'));view.focus();return}
 if(id==='mermaid'){view.dispatch(insertToolbarItem(view.state,'mermaid'));view.focus();return}
 if(id==='math'){view.dispatch(insertMath(view.state));view.focus();return}
 if(id==='code'){view.dispatch(codeBlock(view.state));view.focus();return}
 if(id==='link'){openLinkEditor(trigger);return}if(id==='table'){view.dispatch(insertTable(view.state));if(!focusTableCell(view))view.focus();return}
 if(id==='deliver'){dialog('delivery-dialog',trigger);return}
 if(id==='rescue'){await rescue();return}
 if(id==='retry-close'){closeDialog('close-dialog');savedPosition='';await closeApp();return}
 if(id.startsWith('theme:')){await setAppearance({theme:id.split(':')[1] as ThemeID,auto:'off'});return}
 if(id==='rename'){if(doc.path){toast(messages.fUseSaveAsToGiveAnExistingFileA());return}$<HTMLInputElement>('#rename-input').value=doc.title===messages.fUntitledDocument()?'':doc.title;validateDraftName();dialog('rename-dialog',trigger);$<HTMLInputElement>('#rename-input').select();return}
 if(id==='read'){await toggleRead();return}if(id==='layout'){await toggleLayout();return}if(id==='globalSearch'){globalSearch?.open();return}if(id==='undo'){undo(view);view.focus();return}if(id==='redo'){redo(view);view.focus();return}if(id==='find'){if(documentFind.opened)documentFind.close();else documentFind.open();return}
 if(id==='settings'||id==='theme'){
  if(!dockQuery.matches&&!$('#drawer').hidden)closeDrawer();
  setRailSelected('settings');
  dialog('appearance',trigger);
  requestAnimationFrame(()=>$('#themes [aria-checked=true]').focus());
  return;
 }
 if(id==='sidebar'||id==='recent'){await openDrawer('history');return}if(id==='library'){await openDrawer('library');return}if(id==='outline'){toggleOutline();return}
 if(id==='remove'){confirmRemove(doc.id,true);return}
 if(id==='image'){$('#image-input').click();return}if(id==='close'){await closeApp();return}
 await run(async()=>{switch(id){case 'new':if(await saveForAction())loadNewDocument(await call<WorkspaceState>('New'));break;case 'open':if(!await saveForAction())break;$('#open-input').click();break;case 'save':case 'retry':if(id==='retry')savedPosition='';await save(true);if(!doc.path&&id==='save')await saveAs();break;case 'saveAs':await saveAs();break;case 'export':await exportDoc();break;case 'docx':case 'pdf':case 'copyRich':case 'html':await prepareDelivery(id);break;case 'reload':if(await saveForAction())load(await call<WorkspaceState>('Reload',doc.id));break;case 'overwrite':if(!await saveForAction())break;const title=doc.title;load(await call<WorkspaceState>('Overwrite',doc.id));toast(messages.fOverwritten(title));break;}})
}
function scheduleOutline(immediate=false){
 clearTimeout(outlineTimer);if(compositionActive||!view)return;
 const update=(budget:number)=>{
  // The editor parses little beyond the screen; finish the tree in slices short enough not to hold up a frame,
  // listing what is parsed meanwhile. While a document opens, the rest waits until it shows.
  const tree=fullTree(budget);if(!tree)outlineTimer=setTimeout(update,budget?30:200,5);
  const next=headings(view.state,tree??syntaxTree(view.state)).filter(h=>h.level<=3),list=$('#right-outline .outline-list');
  // Typing that leaves the headings alone keeps the buttons.
  if(next.length&&list.childElementCount&&next.length===outlineHeadings.length&&next.every((h,i)=>h.slug===outlineHeadings[i].slug&&h.text===outlineHeadings[i].text&&h.level===outlineHeadings[i].level)){outlineHeadings=next;scheduleOutlineLayout();return}
  outlineHeadings=next;list.replaceChildren();
  for(const h of outlineHeadings){const b=node('button','outline-item',h.text);b.dataset.slug=h.slug;b.style.paddingLeft=(10+(h.level-1)*12)+'px';b.onclick=()=>{jumpToHeading(h.slug)};list.append(b)}
  if(!outlineHeadings.length)list.append(node('p','dialog-note',messages.fAddAHeadingToSeeTheOutlineHere()));
  scheduleOutlineLayout();
 };
 if(immediate)update(0);else outlineTimer=setTimeout(update,200,5);
}
// The whole document's tree, parsing for at most `budget` ms; null while unfinished. Progress carries over to the next call.
function fullTree(budget:number){return ensureSyntaxTree(view.state,view.state.doc.length,budget)}
function scheduleOutlineLayout(){if(!outlineFrame)outlineFrame=requestAnimationFrame(()=>{outlineFrame=0;layoutOutline()})}
let outlinePopover=false;
let outlineOpen=false;
function layoutOutline(){
 const outline=$('#right-outline'),button=$('#outline-button');
 const showOutline=outlineOpen;
 button.hidden=false;
 outline.hidden=!showOutline;
 outline.inert=!showOutline;
 $('.desk').classList.toggle('outline-open',showOutline);
 button.setAttribute('aria-expanded',String(outlineOpen));
 const wantIcon=outlineOpen?'chevron-right':'chevron-left';
 if(button.dataset.icon!==wantIcon){
  button.dataset.icon=wantIcon;
  button.classList.add('rs-icon-anim');
  button.replaceChildren(icon(wantIcon));
 }
 const tip=outlineOpen?'收起大纲':'展开大纲';
 button.dataset.tip=tip;
 button.setAttribute('aria-label',tip);
 if(outline.hidden)return;
 let current:string|undefined;
 if(reading()){const scrollEl=$('.preview-scroll'),top=scrollEl.getBoundingClientRect().top,heads=$('#preview-content').querySelectorAll<HTMLElement>('h1,h2,h3');for(const h of heads)if(h.getBoundingClientRect().top<=top+2)current=h.id;
  // Before the first heading reaches the top edge the reader is still inside the first section.
  if(!current&&heads.length&&heads[0].getBoundingClientRect().top>top+2)current=heads[0].id;
  // A final section shorter than the viewport can never scroll its heading to the top; pin it once the reader is at the bottom.
  if(scrollEl.scrollHeight>scrollEl.clientHeight+2&&scrollEl.scrollTop+scrollEl.clientHeight>=scrollEl.scrollHeight-2&&heads.length)current=heads[heads.length-1].id}
 else for(const h of outlineHeadings){if(h.from>view.state.selection.main.head)break;current=h.slug}
 for(const b of $$('#right-outline button')){if(b.dataset.slug===current)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current')}
}
function outlineItem(){const outline=$('#right-outline');return outline.querySelector<HTMLElement>('[aria-current]')||outline.querySelector<HTMLElement>('button')}
function toggleOutline(){
 outlineOpen=!outlineOpen;
 outlinePopover=outlineOpen;
 layoutOutline();
 if(outlineOpen)outlineItem()?.focus();
}
function closeOutlinePopover(restore=false){if(!outlineOpen)return;outlineOpen=false;outlinePopover=false;layoutOutline();if(restore)$('#outline-button').focus()}
$('#outline-button').onclick=toggleOutline;
$('#right-outline').addEventListener('keydown',e=>{
 if(!outlineOpen)return;const items=$$('#right-outline button'),i=items.indexOf(document.activeElement as HTMLElement);
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeOutlinePopover(true)}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus()}
});
const outlineResize=new ResizeObserver(scheduleOutlineLayout);
for(const selector of ['.workarea','.editor-scroll','.paper','.preview-scroll','#preview-content'])outlineResize.observe($(selector));
new MutationObserver(scheduleOutlineLayout).observe($('#preview-content'),{childList:true,subtree:true});
$('.preview-scroll').addEventListener('scroll',scheduleOutlineLayout,{passive:true});
$('.editor-scroll').addEventListener('scroll',scheduleOutlineLayout,{passive:true});
window.addEventListener('resize',scheduleOutlineLayout);
function jumpToHeading(slug:string){
 // The outline may list headings from a tree the editor has not caught up with yet.
 const h=headings(view.state,fullTree(500)??syntaxTree(view.state)).find(h=>h.slug===slug||h.text===slug);if(h){if(reading()){const target=Array.from($('#preview-content').querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).find(el=>el.id===h.slug);if(target){previewSmoothScroll?.cancel();const scroll=$('.preview-scroll');scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top}scheduleOutlineLayout();focusContent()}else{view.dispatch({selection:{anchor:h.from},scrollIntoView:true});view.focus()}}else toast(messages.fHeadingNotFound());
}
function openLink(url:string){
 const target=wikiTarget(url);
 if(target!==null){void openWikiLink(target);return}
 const local=localDocumentLink(url);
 if(local){void openWikiLink(local.path.replace(/\.md$/i,''));return}
 if(!safeLink(url)){toast(messages.fThisTypeOfLinkIsNotSupported());return}
 if(url.startsWith('#')){let slug=url.slice(1);try{slug=decodeURIComponent(slug)}catch{}jumpToHeading(slug);return}
 window.open(url,'_blank','noopener,noreferrer');
}
const canOpenLink=(url:string)=>wikiTarget(url)!==null||!!localDocumentLink(url)||safeLink(url);
async function openWikiLink(target:string){
 if(busy||!doc||!view)return;
 if(compositionActive||view.composing){toast(messages.fFinishComposingYourTextFirst());return}
 const origin=view,sourceID=doc.id,stamp=generation,layout=appearance.layout,locale=pageLocale(),epoch=++navigationEpoch;
 let revision=-1,candidates:SearchResponse|undefined;
 const valid=()=>view===origin&&doc.id===sourceID&&generation===stamp&&!dirty&&!compositionActive&&!view.composing&&appearance.layout===layout&&pageLocale()===locale&&navigationEpoch===epoch&&(revision<0||doc.revision===revision);
 await run(async()=>{
  if(!await saveForAction()||!valid())return;
  revision=doc.revision;
  try{
   const result=await call<SearchResponse>('ResolveWikiLink',{sourceID,revision,target} satisfies WikiResolveRequest);
   if(valid())candidates=result;
  }catch(error){if(valid())toast(errorText(error))}
 });
 if(!candidates||!valid())return;
 if(!candidates.total){toast(messages.fWikiMissing(target));return}
 const item=candidates.total===1?candidates.items[0]:await wikiChooser.choose(candidates.items);
 if(item&&valid())await navigateSearch(item);
}
function openLinkEditor(trigger?:HTMLElement){
 const existing=linkAt(view.state),r=view.state.selection.main;editRange=existing?{from:existing.from,to:existing.to,raw:view.state.sliceDoc(existing.from,existing.to)}:{from:r.from,to:r.to,raw:view.state.sliceDoc(r.from,r.to)};
 $<HTMLInputElement>('#link-text').value=existing?.text||view.state.sliceDoc(r.from,r.to);
 $<HTMLInputElement>('#link-url').value=existing?.url||'';$('#link-remove').hidden=!existing;$('#link-open').hidden=!canOpenLink($<HTMLInputElement>('#link-url').value);$('#link-error').hidden=true;dialog('link-dialog',trigger);$('#link-text').focus();
}
function applyRange(text:string){if(!editRange)return;if(view.state.sliceDoc(editRange.from,editRange.to)!==editRange.raw){throw Error(messages.fTheDocumentChangedReopenTheEditingPanel())}
 view.dispatch({changes:{from:editRange.from,to:editRange.to,insert:text},selection:{anchor:editRange.from+text.length},userEvent:'input.format',annotations:isolateHistory.of('full')});view.focus();
}
$('#link-form').onsubmit=e=>{e.preventDefault();try{applyRange(makeLink($<HTMLInputElement>('#link-text').value,$<HTMLInputElement>('#link-url').value));closeDialog('link-dialog');view.focus()}catch(e){$('#link-error').textContent=errorText(e);$('#link-error').hidden=false}};
$('#link-open').onclick=()=>openLink($<HTMLInputElement>('#link-url').value);
$('#link-url').addEventListener('input',()=>{const url=$<HTMLInputElement>('#link-url').value;$('#link-open').hidden=!canOpenLink(url);if(!$('#link-error').hidden&&safeLink(url))$('#link-error').hidden=true});
$('#link-remove').onclick=()=>{try{applyRange($<HTMLInputElement>('#link-text').value.replace(/[\\`*_{}[\]()#+.!|>~-]/g,'\\$&'));closeDialog('link-dialog');view.focus()}catch(e){toast(errorText(e))}};
// Each button's keys come from shortcuts.ts, so its tooltip, All Commands and the key handler agree.
const formatButtons=()=>[
 [['undo',messages.fUndo()],['redo',messages.fRedo()]],
 [['bold',messages.fBold()],['italic',messages.fItalic()],['underline',messages.fUnderline()],['strike',messages.fStrikethrough()],['highlight',messages.fHighlight()],['inlineCode',messages.fInlineCode()],['superscript',messages.fSuperscript()],['subscript',messages.fSubscript()],['clearFormatting',messages.fClearFormatting()]],
 [['quote',messages.fBlockquote()],['bullet',messages.fBulletedList()],['ordered',messages.fNumberedList()],['task',messages.fTaskList()],['outdent',messages.fOutdent()],['indent',messages.fIndent()]],
 [['link',messages.fLink()],['table',messages.fTable()],['code',messages.fCodeBlock()],['math',messages.fFormula()],['mermaid',messages.fDiagram()],['footnote',messages.fFootnote()]],
];
const group=$('.format-group'),headingButton=$('#heading-button');headingButton.remove();
const insertButton=node('button','format-text');insertButton.id='insert-button';insertButton.setAttribute('aria-haspopup','menu');insertButton.setAttribute('aria-controls','insert-menu');insertButton.setAttribute('aria-expanded','false');insertButton.setAttribute('aria-label',messages.fInsert());insertButton.dataset.tip=messages.fInsert();insertButton.append(icon('plus'),node('span','',messages.fInsert()),icon('chevron-down'));
const insertPopup=node('div','menu');insertPopup.id='insert-menu';insertPopup.setAttribute('role','menu');insertPopup.setAttribute('aria-label',messages.fInsert());insertPopup.hidden=true;document.body.append(insertPopup);
function populateInsertMenu(){insertPopup.replaceChildren(...filterSlashItems('').map(item=>{const b=node('button','',(messages[item.label] as ()=>string)());b.setAttribute('type','button');b.tabIndex=-1;b.setAttribute('role','menuitem');b.dataset.menuAction=item.id;return b}))}
populateInsertMenu();
let insertBelow:{from:number;to:number}|undefined;
let insertCellFootnote:(()=>import('@codemirror/state').TransactionSpec)|undefined;
const captureInsert=()=>{insertBelow=focusedImageRange(view)||focusedTableRange(view)||undefined;insertCellFootnote=tableFootnote(view)};
insertButton.addEventListener('pointerdown',captureInsert);insertButton.addEventListener('keydown',captureInsert);
insertButton.addEventListener('click',()=>{if(focusedImageRange(view)||focusedTableRange(view))captureInsert()});
const insertMenu=attachMenu(insertButton,insertPopup,id=>{
 if(compositionActive||view.composing||view.state.readOnly)return;
 view.dispatch(id==='footnote'&&insertCellFootnote?insertCellFootnote():insertToolbarItem(view.state,id as SlashItemID,insertBelow));insertBelow=undefined;insertCellFootnote=undefined;
 if(id!=='table'||!focusTableCell(view))view.focus();if(id==='image')void action('image');
});
function separator(){const sep=node('span','format-sep');sep.setAttribute('aria-hidden','true');group.append(sep)}
// Each group wraps as a whole, so a narrow toolbar never splits one across rows.
let cluster=node('span','format-cluster');cluster.append(insertButton);group.prepend(cluster);
for(const [index,buttons] of formatButtons().entries()){
 if(index===1){separator();group.append(headingButton)}
 if(index){separator();cluster=node('span','format-cluster');group.append(cluster)}
 for(const [id,label] of buttons){const b=node('button','tool'),keys=shortcuts[id];b.dataset.action=id;b.dataset.tip=label;b.setAttribute('aria-label',label);if(keys){b.dataset.shortcut=keys;b.setAttribute('aria-keyshortcuts',ariaKeys(keys))}b.append(icon(id));cluster.append(b)}
}
$$('#format-bar button').forEach(b=>b.onmousedown=e=>e.preventDefault());
// Native Tab scrolling can leave the end of an overflowing flex toolbar
// clipped. Correct only that local strip after focus and its labels settle.
$('#format-bar').addEventListener('focusin',event=>{
 const button=event.target;
 if(!(button instanceof HTMLButtonElement))return;
 requestAnimationFrame(()=>{
  const bar=$('#format-bar');
  if(document.activeElement!==button||bar.scrollWidth<=bar.clientWidth)return;
  const bounds=bar.getBoundingClientRect(),target=button.getBoundingClientRect();
  const delta=target.left<bounds.left+12?target.left-bounds.left-12:target.right>bounds.right-12?target.right-bounds.right+12:0;
  if(delta)bar.scrollLeft+=delta;
 });
});
// A separator left at either end of a wrapped row is hidden.
const middle=(el:Element)=>{const r=el.getBoundingClientRect();return r.top+r.height/2};
const separators=new ResizeObserver(()=>{for(const sep of group.querySelectorAll<HTMLElement>(':scope>.format-sep')){const a=sep.previousElementSibling,b=sep.nextElementSibling;sep.style.visibility=a&&b&&Math.max(Math.abs(middle(a)-middle(sep)),Math.abs(middle(b)-middle(sep)))>8?'hidden':''}});
separators.observe(group);
attachMenu(headingButton,$('#heading-menu'),id=>{void action(id)});
// Focus entering or leaving a cell changes the toolbar's block affordances even if its CodeMirror cursor did not move.
document.addEventListener('focusin',()=>{if(view)updateHeading()});document.addEventListener('focusout',()=>setTimeout(()=>{if(view)updateHeading()}));
$$('[data-deliver]').forEach(b=>b.onclick=()=>{closeDialog('delivery-dialog');void action(b.dataset.deliver!)});
localizePage();
for(const kbd of $$('kbd[data-keys]'))kbd.textContent=keyLabel(kbd.dataset.keys!);
applyIcons();
// The drawn tooltip replaces title. Controls whose keys do their own action announce them.
attachTooltips();for(const el of $$('.topbar [data-shortcut],.drawer-head [data-shortcut],.rs-rail [data-shortcut]'))el.setAttribute('aria-keyshortcuts',ariaKeys(el.dataset.shortcut!));
for(const item of $$('#heading-menu [data-menu-action]'))item.setAttribute('aria-keyshortcuts',ariaKeys(shortcuts[item.dataset.menuAction!]));
// Safari does not focus clicked buttons; the opening control is still the return target.
$$('[data-action]').forEach(b=>b.onclick=()=>void action(b.dataset.action!,b));
$('#rename-input').addEventListener('input',validateDraftName);
$('#rename-form').onsubmit=e=>{e.preventDefault();const title=$<HTMLInputElement>('#rename-input').value.trim();if(!title)return;void run(async()=>{if(!await saveForAction())return;const result=await call<WorkspaceState>('Rename',doc.id,title);result.appearance=appearance;doc.title=result.current.title;doc.customTitle=result.current.customTitle;state=result;header();sidebarSearch?.refresh();closeDialog('rename-dialog')})};
async function importFile(file:File){await run(async()=>{if(!await saveForAction())return;const content=await file.text();load(await call<WorkspaceState>('New'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:content}});await save()})}
$('#open-input').onchange=async()=>{const f=$<HTMLInputElement>('#open-input').files?.[0];if(!f)return;await importFile(f);$<HTMLInputElement>('#open-input').value=''};
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault()});
window.addEventListener('drop',e=>{if(e.dataTransfer?.files.length)e.preventDefault()});
document.addEventListener('keydown',e=>{
 if(homeSplash?.isOpen()){
  const mod=e.ctrlKey&&!e.metaKey&&!e.altKey;
  if(!e.isComposing&&!e.defaultPrevented&&!document.querySelector('dialog[open]')&&mod&&((e.key.toLowerCase()==='k'&&!e.shiftKey)||(e.key.toLowerCase()==='f'&&e.shiftKey))){e.preventDefault();globalSearch?.open();return}
  if(e.key==='Escape'&&!e.isComposing&&!e.defaultPrevented&&!document.querySelector('dialog[open]')){e.preventDefault();homeSplash.closeHome()}
  return;
 }
 if(!e.isComposing&&!e.defaultPrevented&&!compositionActive&&!e.altKey&&!document.querySelector('dialog[open]')&&view){
  const mod=e.ctrlKey&&!e.metaKey;
  if(mod&&e.key.toLowerCase()==='f'&&!e.shiftKey){e.preventDefault();void action('find');return}
  if(mod&&((e.key.toLowerCase()==='k'&&!e.shiftKey)||(e.key.toLowerCase()==='f'&&e.shiftKey))){e.preventDefault();void action('globalSearch');return}
  if(documentFind?.opened&&(mod&&e.key.toLowerCase()==='g'||!e.metaKey&&!e.ctrlKey&&e.key==='F3')){e.preventDefault();documentFind.move(e.shiftKey?-1:1);return}
  if(e.key==='Escape'&&documentFind?.opened){e.preventDefault();documentFind.close();return}
 }
 if(!e.isComposing&&!compositionActive&&!e.defaultPrevented&&e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.key===','&&!document.querySelector('dialog[open]')){e.preventDefault();void action('settings');return}
 if(e.isComposing||e.defaultPrevented)return;if(e.key==='Escape'&&!document.querySelector('dialog[open]')){if(outlinePopover){closeOutlinePopover(true);return}const drawerOpen=!dockQuery.matches&&!$('#drawer').hidden;closeOverlayDrawer();if(drawerOpen)$('#sidebar-button').focus();else if(view)focusContent()}
 if(!document.querySelector('dialog[open]')&&view&&!compositionActive){if(e.altKey&&e.shiftKey&&['ArrowUp','ArrowDown'].includes(e.key)&&(view.hasFocus||!!blockControls(view)?.range)){e.preventDefault();void action('block:'+(e.key==='ArrowUp'?'up':'down'));return}if(e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key==='/'&&(view.hasFocus||!!blockControls(view)?.range)){e.preventDefault();void action('block:menu');return}}
 // Format keys come from shortcuts.ts. In a text field, a menu or a control inside the editor (a table's ⋯ button) they belong to that control, not to the document.
 if(!e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();let id='';if(document.querySelector('dialog[open]'))return;const format=shortcutAction(e);if(format){if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||e.target instanceof Element&&e.target.closest('[role=menu],.cm-editor button'))return;e.preventDefault();void action(format);return}if(k==='z'&&e.shiftKey)id='redo';if(k==='p')id='pdf';if(k==='n')id='new';if(k==='o')id='open';if(k==='s')id=e.shiftKey?'saveAs':'save';if(k==='\\')id='layout';if(k==='r'&&e.shiftKey)id='read';if(k==='v'&&e.shiftKey)id='pastePlain';if(id){e.preventDefault();void action(id)}
});
$('.editor-pane').addEventListener('mousedown',e=>{
 if(e.button!==0||e.shiftKey||e.metaKey||e.ctrlKey||e.altKey||!view||view.state.readOnly||compositionActive)return;
 if(![$('.editor-pane'),$('.editor-scroll'),$('.editor-status'),$('#word-count'),$('.paper'),$('#editor'),view.dom,view.scrollDOM,view.contentDOM].includes(e.target as HTMLElement))return;
 if(e.clientY<Math.min(view.contentDOM.getBoundingClientRect().bottom,view.documentTop+view.lineBlockAt(view.state.doc.length).bottom))return;
 e.preventDefault();const state=view.state,doc=state.doc;let last=doc.line(doc.lines);while(last.number>1&&!last.text.trim())last=doc.line(last.number-1);
 // Text below a final table or image needs its own paragraph, as leaving the widget does.
 const table=tableAround(state,last.from+last.text.trimEnd().length);
 const image=imageRanges(state).find(i=>i.from>=last.from&&i.to<=last.to);
 view.dispatch(table?leaveTable(state,table):image?leaveBlock(state,image):{selection:{anchor:doc.length},userEvent:'select.pointer'});view.focus();
});
$('.editor-scroll').addEventListener('scroll',()=>{if(loading||!doc)return;scheduleAutoSave()},{passive:true});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty&&!compositionActive)void save()});
preview=createPreviewController({
 host:$('#preview-content'),
 scroll:$('.preview-scroll'),
 getContent:()=>view?.state.doc.toString()||'',
 resolveImage:resolveImageFor,
 openLink,
 onRendered:()=>splitScroll?.notifyLayoutChange(),
});
splitScroll=createSplitScrollController({
 isActive:()=>split()&&!!doc&&!homeSplash?.isOpen(),
 getView:()=>view,
 editorScroll:$('.editor-scroll'),
 previewScroll:$('.preview-scroll'),
 previewHost:$('#preview-content'),
 onPreviewDrive:()=>preview.cancelFollow(),
});
previewSmoothScroll=createSmoothScroll($('.preview-scroll'),()=>reducedMotion.matches);
documentFind=createDocumentFind({getView:()=>view,reading,blocked:()=>busy||compositionActive||!!view?.composing,focusContent,host:$('#preview-content'),scroll:$('.preview-scroll')});
sidebarSearch=createSidebarSearch({
 input:$<HTMLInputElement>('#recent-search'),select:$<HTMLSelectElement>('#tag-filter'),label:$('#recent-label'),list:$('#drawer-list'),status:$('#search-status'),consistency:$('#search-consistency'),
 request:(query,tag)=>call<DocumentFilterResponse>('FilterDocuments',{query,tag} satisfies DocumentFilterRequest),
 activate:(item,hit)=>void navigateSearch(item,hit),
 recent:(recent,selected)=>{if(recent){state.recent=recent;homeSplash?.updateRecent(recent)}renderRecent(selected)},escape:()=>{closeDrawer();focusContent()},
});
folderTree=createFolderTree({
 host:$('#folder-tree'),
 statsEl:$('#library-stats'),
 filterInput:$<HTMLInputElement>('#library-filter-input'),
 addBtn:$<HTMLButtonElement>('#add-folder-btn'),
 refreshBtn:$<HTMLButtonElement>('#lib-refresh-btn'),
 expandBtn:$<HTMLButtonElement>('#lib-expand-btn'),
 promptDialog:$<HTMLDialogElement>('#fs-prompt-dialog'),
 promptTitle:$('#fs-prompt-title'),
 promptInput:$<HTMLInputElement>('#fs-prompt-input'),
 promptForm:$<HTMLFormElement>('#fs-prompt-form'),
 promptCancel:$<HTMLButtonElement>('#fs-prompt-cancel'),
 getActivePath:()=>doc?.path||'',
 beforeOpen:saveForAction,
 onOpenState:next=>{
  tabsEmpty=false;
  if(homeSplash?.isOpen())homeSplash.closeHome();
  load(next);
  closeOverlayDrawer();
  void folderTree?.refresh();
 },
 onError:e=>toast(errorText(e)),
 onToast:m=>toast(m),
});
globalSearch=createGlobalSearch({
 dialog:$<HTMLDialogElement>('#global-search-dialog'),
 input:$<HTMLInputElement>('#global-search-input'),
 status:$('#global-search-status'),
 list:$('#global-search-list'),
 closeBtn:$<HTMLButtonElement>('#global-search-close'),
 beforeOpen:saveForAction,
 onOpenDoc:(next,hit)=>jumpToGlobalSearchHit(next,hit),
 onError:e=>toast(errorText(e)),
});
function jumpToGlobalSearchHit(next:WorkspaceState,hit:GlobalSearchHit){
 tabsEmpty=false;
 if(homeSplash?.isOpen())homeSplash.closeHome();
 const same=doc&&doc.id===next.current.id&&view?.state.doc.toString()===next.current.content;
 const scrollToLine=()=>{
  if(!view)return;
  const lineNum=Math.max(1,Math.min(hit.line||1,view.state.doc.lines));
  const line=view.state.doc.line(lineNum);
  const firstMatch=hit.parts.find(p=>p.highlight)?.text||'';
  const relIdx=firstMatch?line.text.toLowerCase().indexOf(firstMatch.toLowerCase()):-1;
  const from=relIdx>=0?line.from+relIdx:line.from;
  const to=relIdx>=0?from+firstMatch.length:line.from;
  view.dispatch({selection:{anchor:from,head:to},effects:EditorView.scrollIntoView(from,{y:'center'}),annotations:Transaction.addToHistory.of(false)});
  if(split()||reading())preview.jumpToLine(lineNum-1);
  focusContent();
 };
 if(!same){
  load(next);
  const targetView=view,targetID=next.current.id;
  requestAnimationFrame(()=>{if(view===targetView&&doc?.id===targetID)scrollToLine()});
 }else{
  scrollToLine();
 }
 closeOverlayDrawer();
}
document.querySelector<HTMLButtonElement>('#global-search-button')?.addEventListener('click',()=>globalSearch?.open());
document.querySelector<HTMLButtonElement>('#library-gsearch-btn')?.addEventListener('click',()=>globalSearch?.open());
homeSplash=initHomeSplash({
 reducedMotion:reducedMotion.matches,
 onSearch:query=>call<DocumentFilterResponse>('FilterDocuments',{query,tag:''} satisfies DocumentFilterRequest),
 onOpenItem:(item,hit)=>navigateSearch(item,hit),
 onOpenRecent:async docId=>{
  await run(async()=>{
   if(doc&&doc.id===docId){focusContent();return}
   if(await saveForAction()){load(await call<WorkspaceState>('Activate',docId));closeOverlayDrawer()}
  });
 },
 onCreateWithTitle:async title=>{
  await run(async()=>{
   if(!await saveForAction())return;
   loadNewDocument(await call<WorkspaceState>('New'));
   const heading=`# ${title}\n\n`;
   view.dispatch({changes:{from:0,to:view.state.doc.length,insert:heading},selection:{anchor:heading.length}});
   await save(true);
   sidebarSearch?.refresh();
   focusContent();
  });
 },
 onNewBlank:()=>action('new'),
 onOpenLocal:()=>void action('open'),
 onDismiss:()=>{
  sidebarRequestedInHome=false;
  syncDrawer();
  refreshRailFromState();
  if(view)focusContent();
 },
});
const homeBtn=document.querySelector<HTMLButtonElement>('#home-button');
if(homeBtn){
 refreshRailFromState();
 homeBtn.onclick=()=>{
  const appearanceEl=document.querySelector<HTMLDialogElement>('#appearance');
  const wasPanelOpen=!!appearanceEl?.open||!$('#drawer').hidden;
  if(appearanceEl?.open)closeDialog('appearance');
  if(!$('#drawer').hidden)closeDrawer();
  if(homeSplash?.isOpen()){
   if(!wasPanelOpen&&!tabsEmpty){homeSplash.closeHome();refreshRailFromState()}
   else setRailSelected('home');
  }else{
   homeSplash?.openHome(false);
   syncDrawer();
   setRailSelected('home');
  }
 };
}
let externalOpenQueue:Promise<void>=Promise.resolve();
function drainPendingExternalFiles(){
 if(!isTauri())return;
 externalOpenQueue=externalOpenQueue.then(async()=>{
  const paths=await invoke<string[]>('readsoul_take_pending_files').catch(()=>[]);
  if(!paths.length)return;
  while(busy||compositionActive)await new Promise(resolve=>setTimeout(resolve,50));
  await run(async()=>{
   if(doc&&!(await saveForAction()))return;
   let latest:WorkspaceState|undefined;
   for(const path of paths){
    try{latest=await call<WorkspaceState>('OpenFile',path)}
    catch(e){banner(messages.fDocumentOpenError(errorText(e)),'notice')}
   }
   if(latest){
    tabsEmpty=false;
    homeSplash?.closeHome();
    load(latest,undefined,false);
    refreshRailFromState();
   }
  });
 });
}
if(isTauri()){
 void listen('readsoul://open-files',()=>drainPendingExternalFiles());
}
try{
 const openedFromCli=isTauri()?await invoke<boolean>('readsoul_consume_startup_file').catch(()=>false):false;
 const next=await call<WorkspaceState>('State');
 next.appearance={...next.appearance,layout:'read'};
 if(openedFromCli){
  tabsEmpty=false;
  homeSplash?.closeHome();
  load(next,undefined,false);
  refreshRailFromState();
 }else{
  load(next,undefined,true);
 }
 if(next.notices?.length)showNotices(next);
 void folderTree?.refresh();
 drainPendingExternalFiles();
}catch(e){banner(messages.fDocumentOpenError(errorText(e)),'notice')}
async function pollStatus(){
 if(!doc||busy||dirty||saveFlight||compositionActive||document.visibilityState!=='visible')return;
 const id=doc.id;let s:DocStatus;try{s=await call<DocStatus>('Status',id)}catch{return}
 if(!doc||doc.id!==id||dirty||busy||saveFlight)return;
 if(s.revision!==doc.revision){await run(async()=>{load(await call<WorkspaceState>('Activate',id));toast(messages.fLoadedTheLatestVersionFromDisk())});return}
 if(s.conflict!==doc.conflict||s.statusCode!==doc.statusCode||s.status!==doc.status){doc.conflict=s.conflict;doc.status=s.status;doc.statusCode=s.statusCode;header();if(s.conflict||statusFailed(s))banner(statusText(s),s.conflict?'conflict':'error');else banner()}
}
setInterval(()=>void pollStatus(),desktop?10000:2000);
document.addEventListener('visibilitychange',()=>void pollStatus());
window.addEventListener('focus',()=>void pollStatus());
