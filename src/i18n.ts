import {messages,type Messages} from '../locales';
import type {DocStatus,LocaleNotice} from './types';
import {keyLabel} from './platform';

export const activeLocale='zh-Hans';
export function pageLocale(){return activeLocale}
export {messages};

export function localizePage(root:ParentNode=document){
 document.documentElement.lang=activeLocale;
 document.documentElement.dir='ltr';
 // Messages with a {shortcut} take the element's data-shortcut, written for this platform; others ignore it.
 const lookup=messages as unknown as Record<string,(shortcut?:string)=>string>;
 const shortcut=(el:HTMLElement)=>el.dataset.shortcut?keyLabel(el.dataset.shortcut):undefined;
 for(const el of root.querySelectorAll<HTMLElement>('[data-i18n]')){const say=lookup[el.dataset.i18n!];if(say)el.textContent=say(shortcut(el))}
 for(const attr of ['title','aria-label','placeholder'])for(const el of root.querySelectorAll<HTMLElement>('[data-i18n-'+attr+']')){const say=lookup[el.getAttribute('data-i18n-'+attr)!];if(say)el.setAttribute(attr,say(shortcut(el)))}
 // Tooltip text never carries keys: the tooltip shows data-shortcut beside it.
 for(const el of root.querySelectorAll<HTMLElement>('[data-i18n-tip]')){const say=lookup[el.dataset.i18nTip!];if(say)el.dataset.tip=say()}
}

const statusMessages={
 draftSaved:'bStatusDraftSaved',fileSaved:'bStatusFileSaved',fileReadOnly:'bStatusFileReadOnly',fileUnavailable:'bStatusFileUnavailable',diskUnreadable:'bStatusDiskUnreadable',diskReloaded:'bStatusDiskReloaded',reloadRecoveryFailed:'bStatusReloadRecoveryFailed',diskConflict:'bStatusDiskConflict',imageSaveFailed:'bStatusImageSaveFailed',fileSaveFailed:'bStatusFileSaveFailed',saveFailed:'bStatusSaveFailed',recoveryUpdateFailed:'bStatusRecoveryUpdateFailed',
} as const;
type Status=Pick<DocStatus,'status'|'statusCode'|'conflict'>;
function statusCode(doc:Status){
 if(doc.statusCode&&doc.statusCode in statusMessages)return doc.statusCode as keyof typeof statusMessages;
 for(const code of Object.keys(statusMessages) as (keyof typeof statusMessages)[])if(messages[statusMessages[code]]()===doc.status)return code;
 return doc.conflict?'diskConflict':'draftSaved';
}
function catalogText(key:string,args:Record<string,unknown>={},fallback=''){
 switch(key){
  case 'bCorruptDrafts':return messages.bCorruptDrafts(Number(args.count||0));
  case 'bShortcutUnavailable':return messages.bShortcutUnavailable(String(args.shortcut||''));
  case 'bImageUnreadable':return messages.bImageUnreadable(String(args.path||''));
  case 'bOpenFailed':return messages.bOpenFailed(String(args.name||''),String(args.error||''));
  default:{const say=(messages as unknown as Record<string,()=>string>)[key];return say?say():fallback}
 }
}
export class CatalogError extends Error {
 constructor(readonly key:string,readonly args:Record<string,unknown>,fallback:string){super(fallback)}
 translated(){return catalogText(this.key,this.args,this.message)}
}
export function localizedError(error:unknown){
 if(error instanceof CatalogError)return error.translated();
 return error instanceof Error?error.message:String(error);
}
export function noticeText(notice:LocaleNotice){return catalogText(notice.key||'',notice.args,notice.text||'')}
export function statusText(doc:Status){return messages[statusMessages[statusCode(doc)]]()}
export function statusFailed(doc:Status){return ['reloadRecoveryFailed','imageSaveFailed','fileSaveFailed','fileReadOnly','saveFailed','recoveryUpdateFailed'].includes(statusCode(doc))}
