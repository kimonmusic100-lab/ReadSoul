import {invoke,isTauri} from '@tauri-apps/api/core';
import {icon} from './icons';
import {call,type FolderActionResponse,type FolderTreeNode,type MountedFolder,type WorkspaceState} from './types';

export interface FolderTreeOptions {
 host:HTMLElement;
 statsEl:HTMLElement;
 filterInput:HTMLInputElement;
 addBtn:HTMLButtonElement;
 refreshBtn:HTMLButtonElement;
 expandBtn:HTMLButtonElement;
 promptDialog:HTMLDialogElement;
 promptTitle:HTMLElement;
 promptInput:HTMLInputElement;
 promptForm:HTMLFormElement;
 promptCancel:HTMLButtonElement;
 getActivePath:()=>string;
 beforeOpen:()=>Promise<boolean>;
 onOpenState:(state:WorkspaceState)=>void;
 onError:(err:unknown)=>void;
 onToast:(msg:string)=>void;
}

const EXPANDED_STORAGE='readsoul-expanded-folders';

function loadExpanded():Set<string>{
 try{
  const raw=localStorage.getItem(EXPANDED_STORAGE);
  if(raw)return new Set(JSON.parse(raw));
 }catch{}
 return new Set();
}

function saveExpanded(set:Set<string>):void{
 try{localStorage.setItem(EXPANDED_STORAGE,JSON.stringify([...set]))}catch{}
}

function mkBtn(cls:string,tip:string,iconName:string,text=''):HTMLButtonElement{
 const b=document.createElement('button');
 b.type='button';
 b.className=cls;
 b.dataset.tip=tip;
 b.setAttribute('aria-label',tip);
 if(iconName)b.append(icon(iconName));
 if(text){
  const s=document.createElement('span');
  s.textContent=text;
  b.append(s);
 }
 return b;
}

function countMarkdownDocs(nodes:FolderTreeNode[]):number{
 let total=0;
 for(const n of nodes){
  if(n.isDir)total+=countMarkdownDocs(n.children||[]);
  else total++;
 }
 return total;
}

function collectDirPaths(nodes:FolderTreeNode[],out:string[]):void{
 for(const n of nodes){
  if(n.isDir){
   out.push(n.path);
   if(n.children?.length)collectDirPaths(n.children,out);
  }
 }
}

function filterTreeNodes(nodes:FolderTreeNode[],q:string):FolderTreeNode[]{
 const out:FolderTreeNode[]=[];
 for(const n of nodes){
  const nameHit=n.name.toLowerCase().includes(q);
  if(!n.isDir){
   if(nameHit)out.push(n);
   continue;
  }
  const kids=n.children?.length?filterTreeNodes(n.children,q):[];
  if(nameHit){
   out.push(n);
  }else if(kids.length){
   out.push({...n,children:kids});
  }
 }
 return out;
}

function appendHighlightedName(target:HTMLElement,name:string,query:string):void{
 if(!query){
  target.textContent=name;
  return;
 }
 const idx=name.toLowerCase().indexOf(query);
 if(idx<0){
  target.textContent=name;
  return;
 }
 if(idx>0)target.append(document.createTextNode(name.slice(0,idx)));
 const m=document.createElement('mark');
 m.textContent=name.slice(idx,idx+query.length);
 target.append(m);
 if(idx+query.length<name.length)target.append(document.createTextNode(name.slice(idx+query.length)));
}

function relativeLabel(rootPath:string,itemPath:string):string{
 const normRoot=rootPath.replace(/[\\/]+$/,'');
 if(itemPath.toLowerCase().startsWith(normRoot.toLowerCase())){
  const rel=itemPath.slice(normRoot.length).replace(/^[\\/]+/,'');
  return rel||itemPath;
 }
 return itemPath;
}

export function createFolderTree(opts:FolderTreeOptions){
 let folders:MountedFolder[]=[];
 const expanded=loadExpanded();
 let filterQuery='';
 let pendingResolve:((val:string|null)=>void)|null=null;
 let armedTrashPath='';
 let armedUntil=0;

 function askInput(title:string,initial='',placeholder=''):Promise<string|null>{
  if(pendingResolve){pendingResolve(null);pendingResolve=null}
  opts.promptTitle.textContent=title;
  opts.promptInput.value=initial;
  opts.promptInput.placeholder=placeholder;
  opts.promptDialog.showModal();
  requestAnimationFrame(()=>{
   opts.promptInput.focus();
   opts.promptInput.select();
  });
  return new Promise(resolve=>{
   pendingResolve=resolve;
  });
 }

 opts.promptForm.addEventListener('submit',e=>{
  e.preventDefault();
  const val=opts.promptInput.value.trim();
  if(!val)return;
  const res=pendingResolve;
  pendingResolve=null;
  opts.promptDialog.close();
  res?.(val);
 });
 opts.promptCancel.addEventListener('click',()=>{
  const res=pendingResolve;
  pendingResolve=null;
  opts.promptDialog.close();
  res?.(null);
 });
 opts.promptDialog.addEventListener('close',()=>{
  const res=pendingResolve;
  pendingResolve=null;
  res?.(null);
 });

 async function pickAndAddFolder(){
  try{
   let chosen:string|null=null;
   if(isTauri()){
    chosen=await invoke<string|null>('readsoul_pick_folder');
   }else{
    chosen=await askInput('添加本地文件夹到库','','例如 D:\\Notes 或 C:\\Users\\...\\docs');
   }
   if(!chosen)return;
   const next=await call<MountedFolder[]>('AddFolder',chosen);
   folders=next;
   expanded.add(chosen);
   for(const f of next)if(f.path.toLowerCase()===chosen.toLowerCase())expanded.add(f.path);
   saveExpanded(expanded);
   render();
   opts.onToast('已添加本地文件夹到库');
  }catch(err){
   opts.onError(err);
  }
 }

 opts.addBtn.addEventListener('click',()=>{void pickAndAddFolder()});
 opts.refreshBtn.addEventListener('click',()=>{
  void refresh().then(()=>opts.onToast('本地库目录已刷新'));
 });
 opts.expandBtn.addEventListener('click',()=>{
  if(!folders.length)return;
  const allPaths:string[]=[];
  for(const f of folders){
   allPaths.push(f.path);
   collectDirPaths(f.nodes,allPaths);
  }
  const hasCollapsed=allPaths.some(p=>!expanded.has(p));
  if(hasCollapsed){
   for(const p of allPaths)expanded.add(p);
  }else{
   expanded.clear();
  }
  saveExpanded(expanded);
  render();
 });

 opts.filterInput.addEventListener('input',()=>{
  filterQuery=opts.filterInput.value.trim().toLowerCase();
  render();
 });

 async function revealPath(targetPath:string){
  if(!isTauri()){
   opts.onToast(targetPath);
   return;
  }
  try{
   await invoke('readsoul_reveal_path',{path:targetPath});
  }catch(err){
   opts.onError(err);
  }
 }

 async function handleCreate(parentDir:string,kind:'file'|'dir'){
  const val=await askInput(kind==='dir'?'新建子文件夹':'新建 Markdown 文档','',kind==='dir'?'输入文件夹名称':'输入文件名（可省略 .md）');
  if(!val)return;
  if(kind==='file'&&!await opts.beforeOpen())return;
  try{
   const res=await call<FolderActionResponse>('CreateInFolder',parentDir,val,kind);
   folders=res.folders;
   expanded.add(parentDir);
   saveExpanded(expanded);
   if(res.state)opts.onOpenState(res.state);
   else render();
  }catch(err){
   opts.onError(err);
  }
 }

 async function handleRename(oldPath:string,currentName:string){
  const val=await askInput('重命名',currentName,'输入新名称');
  if(!val||val===currentName)return;
  try{
   const res=await call<FolderActionResponse>('RenameFsItem',oldPath,val);
   folders=res.folders;
   if(res.state)opts.onOpenState(res.state);
   else render();
  }catch(err){
   opts.onError(err);
  }
 }

 async function handleTrash(targetPath:string){
  const now=Date.now();
  if(armedTrashPath!==targetPath||now>armedUntil){
   armedTrashPath=targetPath;
   armedUntil=now+3500;
   render();
   setTimeout(()=>{if(armedTrashPath===targetPath){armedTrashPath='';render()}},3600);
   return;
  }
  armedTrashPath='';
  try{
   const res=await call<FolderActionResponse>('TrashFsItem',targetPath);
   folders=res.folders;
   if(res.state)opts.onOpenState(res.state);
   else render();
   opts.onToast('已移入工作区废纸篓');
  }catch(err){
   opts.onError(err);
  }
 }

 function renderNode(node:FolderTreeNode,depth:number,activePath:string,rootPath:string):HTMLElement{
  const wrap=document.createElement('div');
  wrap.className='rs-tree-item';

  const row=document.createElement('div');
  const isActive=!node.isDir&&!!activePath&&node.path.toLowerCase()===activePath.toLowerCase();
  row.className='rs-tree-row'+(isActive?' active':'');
  row.style.paddingLeft=`${10+depth*14}px`;

  const mainBtn=document.createElement('button');
  mainBtn.type='button';
  mainBtn.className='rs-tree-main';
  mainBtn.title=relativeLabel(rootPath,node.path);

  if(node.isDir){
   const isOpen=filterQuery?true:expanded.has(node.path);
   const chev=document.createElement('span');
   chev.className='rs-tree-chev'+(isOpen?' open':'');
   chev.textContent='›';
   mainBtn.append(chev,icon(isOpen?'folder-open':'folder'));
   const label=document.createElement('span');
   label.className='rs-tree-name';
   appendHighlightedName(label,node.name,filterQuery);
   mainBtn.append(label);
   mainBtn.onclick=()=>{
    if(expanded.has(node.path))expanded.delete(node.path);
    else expanded.add(node.path);
    saveExpanded(expanded);
    render();
   };
  }else{
   mainBtn.append(icon('file-text'));
   const label=document.createElement('span');
   label.className='rs-tree-name';
   appendHighlightedName(label,node.name,filterQuery);
   mainBtn.append(label);
   mainBtn.onclick=async()=>{
    if(!await opts.beforeOpen())return;
    try{
     const next=await call<WorkspaceState>('OpenFile',node.path);
     opts.onOpenState(next);
    }catch(err){
     opts.onError(err);
    }
   };
  }

  const actions=document.createElement('div');
  actions.className='rs-tree-actions';
  if(node.isDir){
   const addFile=mkBtn('rs-tree-act','新建文档','file-plus');
   addFile.onclick=e=>{e.stopPropagation();void handleCreate(node.path,'file')};
   const addDir=mkBtn('rs-tree-act','新建文件夹','folder-plus');
   addDir.onclick=e=>{e.stopPropagation();void handleCreate(node.path,'dir')};
   actions.append(addFile,addDir);
  }
  const renameBtn=mkBtn('rs-tree-act','重命名','','✎');
  renameBtn.onclick=e=>{e.stopPropagation();void handleRename(node.path,node.name)};
  const armed=armedTrashPath===node.path&&Date.now()<=armedUntil;
  const trashBtn=mkBtn('rs-tree-act rs-tree-trash'+(armed?' armed':''),armed?'再次点击确认移入废纸篓':'移入废纸篓','',armed?'确认?':'×');
  trashBtn.onclick=e=>{e.stopPropagation();void handleTrash(node.path)};
  actions.append(renameBtn,trashBtn);

  row.append(mainBtn,actions);
  wrap.append(row);

  const shouldShowChildren=node.isDir&&(filterQuery?true:expanded.has(node.path))&&node.children?.length;
  if(shouldShowChildren){
   const kids=document.createElement('div');
   kids.className='rs-tree-children';
   for(const child of node.children!){
    kids.append(renderNode(child,depth+1,activePath,rootPath));
   }
   wrap.append(kids);
  }
  return wrap;
 }

 function render(){
  opts.host.replaceChildren();
  const activePath=opts.getActivePath();
  const totalDocs=folders.reduce((sum,f)=>sum+countMarkdownDocs(f.nodes),0);
  opts.statsEl.textContent=folders.length
   ?`已添加 ${folders.length} 个文件夹 · 共 ${totalDocs} 篇文档`
   :'尚未添加本地文件夹';

  if(!folders.length){
   const empty=document.createElement('div');
   empty.className='rs-lib-empty-card';
   const title=document.createElement('p');
   title.className='rs-tree-empty';
   title.textContent='添加本地主机上的任意文件夹，即可在此以树状层级结构整理与读写其中的 Markdown 笔记。';
   const quickAdd=document.createElement('button');
   quickAdd.type='button';
   quickAdd.className='rs-lib-empty-btn';
   quickAdd.textContent='+ 添加本地文件夹';
   quickAdd.onclick=()=>{void pickAndAddFolder()};
   empty.append(title,quickAdd);
   opts.host.append(empty);
   return;
  }

  let matchedRoots=0;
  for(const root of folders){
   const rootNameHit=!filterQuery||root.name.toLowerCase().includes(filterQuery);
   const visibleNodes=filterQuery?(rootNameHit?root.nodes:filterTreeNodes(root.nodes,filterQuery)):root.nodes;
   if(filterQuery&&!rootNameHit&&!visibleNodes.length)continue;
   matchedRoots++;

   const sec=document.createElement('div');
   sec.className='rs-folder-root';
   const head=document.createElement('div');
   head.className='rs-tree-row rs-folder-head';
   const isOpen=filterQuery?true:expanded.has(root.path);

   const toggle=document.createElement('button');
   toggle.type='button';
   toggle.className='rs-tree-main';
   toggle.title=root.path;
   const chev=document.createElement('span');
   chev.className='rs-tree-chev'+(isOpen?' open':'');
   chev.textContent='›';
   toggle.append(chev,icon(isOpen?'folder-open':'folder'));
   const title=document.createElement('span');
   title.className='rs-tree-name';
   appendHighlightedName(title,root.name,filterQuery);
   toggle.append(title);

   const docCount=countMarkdownDocs(root.nodes);
   const badge=document.createElement('span');
   badge.className='rs-tree-badge';
   badge.textContent=String(docCount);
   toggle.append(badge);

   toggle.onclick=()=>{
    if(expanded.has(root.path))expanded.delete(root.path);
    else expanded.add(root.path);
    saveExpanded(expanded);
    render();
   };

   const actions=document.createElement('div');
   actions.className='rs-tree-actions';
   const newFile=mkBtn('rs-tree-act','新建文档','file-plus');
   newFile.onclick=e=>{e.stopPropagation();void handleCreate(root.path,'file')};
   const newDir=mkBtn('rs-tree-act','新建文件夹','folder-plus');
   newDir.onclick=e=>{e.stopPropagation();void handleCreate(root.path,'dir')};
   const revealBtn=mkBtn('rs-tree-act','在系统文件夹中打开','external-link');
   revealBtn.onclick=e=>{e.stopPropagation();void revealPath(root.path)};
   const unmount=mkBtn('rs-tree-act','从库中移除','','×');
   unmount.onclick=e=>{
    e.stopPropagation();
    void call<MountedFolder[]>('RemoveFolder',root.path).then(next=>{folders=next;render();opts.onToast('已从库中移除文件夹（本地文件未删除）')}).catch(opts.onError);
   };
   actions.append(newFile,newDir,revealBtn,unmount);

   head.append(toggle,actions);
   sec.append(head);

   if(isOpen){
    const body=document.createElement('div');
    body.className='rs-tree-children';
    if(visibleNodes.length){
     for(const node of visibleNodes)body.append(renderNode(node,1,activePath,root.path));
    }else{
     const emptyDir=document.createElement('div');
     emptyDir.className='rs-tree-empty-sub';
     emptyDir.textContent=filterQuery?'无匹配文档':'目录暂无 Markdown 文件';
     body.append(emptyDir);
    }
    sec.append(body);
   }
   opts.host.append(sec);
  }

  if(filterQuery&&!matchedRoots){
   const none=document.createElement('p');
   none.className='rs-tree-empty';
   none.textContent=`未在本地库中找到匹配「${opts.filterInput.value.trim()}」的文件夹或笔记`;
   opts.host.append(none);
  }
 }

 async function refresh(){
  try{
   folders=await call<MountedFolder[]>('ScanFolders');
   if(folders.length===1&&!expanded.size){
    expanded.add(folders[0].path);
    saveExpanded(expanded);
   }
   render();
  }catch(err){
   opts.onError(err);
  }
 }

 return {refresh,render,pickAndAddFolder};
}
