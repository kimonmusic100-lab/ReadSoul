import {invoke} from '@tauri-apps/api/core';
import {pageLocale,messages,CatalogError} from './i18n';
import type {ThemeID,AutoSwitch} from './theme';
export interface Appearance {theme:ThemeID;auto:AutoSwitch;lightTheme:ThemeID;darkTheme:ThemeID;followSystem?:boolean;fontSize?:number;lineWidth?:'normal'|'wide'|'full';layout?:'single'|'split'|'read';sidebarDocked?:boolean;outlineHidden?:boolean;autoSpace?:boolean}
export interface Position {anchor:number;head:number;scroll:number;source:boolean}
export type StatusCode='draftSaved'|'fileSaved'|'fileUnavailable'|'diskUnreadable'|'diskReloaded'|'reloadRecoveryFailed'|'diskConflict'|'imageSaveFailed'|'fileSaveFailed'|'fileReadOnly'|'saveFailed'|'recoveryUpdateFailed';
export interface Doc {id:string;title:string;customTitle?:boolean;content:string;path:string;updated:number;revision:number;position:Position;conflict:boolean;status:string;statusCode?:StatusCode}
export interface DocStatus {id:string;revision:number;conflict:boolean;status:string;statusCode?:StatusCode}
export interface Summary {id:string;title:string;path:string;updated:number;excerpt:string;tags?:string[];warning?:string}
export interface SearchRange {from:number;to:number}
export interface SearchHit extends SearchRange {line:number;text:string;before:string;after:string}
export interface SearchItem {id:string;title:string;path:string;updated:number;revision:number;titleMatch:SearchRange|null;hits:SearchHit[];moreHits:boolean}
export interface SearchResponse {items:SearchItem[];total:number;truncated:boolean}
export interface WikiResolveRequest {sourceID:string;revision:number;target:string}
export interface DocumentFilterRequest {query:string;tag:string}
export interface TagSummary {name:string;count:number}
export interface DocumentFilterItem {document:SearchItem;tags:string[];excerpt:string}
export interface DocumentFilterResponse {items:DocumentFilterItem[];total:number;truncated:boolean;tags:TagSummary[];recent:Summary[]}
export interface LocaleNotice {key?:string;args?:Record<string,unknown>;text?:string}
export interface WorkspaceState {current:Doc;recent:Summary[];appearance:Appearance;folders?:string[];notices?:string[];noticeMessages?:LocaleNotice[]}
export interface FolderTreeNode {name:string;path:string;isDir:boolean;docId?:string;children?:FolderTreeNode[]}
export interface MountedFolder {path:string;name:string;nodes:FolderTreeNode[]}
export interface FolderActionResponse {folders:MountedFolder[];state?:WorkspaceState}
export interface SnippetPart {text:string;highlight:boolean}
export interface GlobalSearchHit {key:string;docId:string;title:string;path:string;heading:string;line:number;parts:SnippetPart[];score:number}
export interface GlobalSearchResponse {hits:GlobalSearchHit[];indexedFiles:number;indexedBlocks:number;elapsedMs:number}
export interface ImageResult {destination:string;url:string;name:string;markdown:string}
declare global {interface Window {__TAURI_INTERNALS__?:unknown}}
export const desktop=typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window;
export async function call<T>(method:string,...args:unknown[]):Promise<T>{
 if(typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window){
  return invoke<T>('readsoul_call',{method,args,locale:pageLocale()});
 }
 const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args,locale:pageLocale()})});
 if(!response.ok)throw Error(messages.fTheLocalServiceIsUnavailableKeepThisWindowOpen());
 const result=await response.json();if(result.error)throw new CatalogError(result.errorCode||'',result.errorArgs||{},result.error);return result.value as T;
}
