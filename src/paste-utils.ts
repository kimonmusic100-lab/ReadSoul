import {messages} from './i18n';
import type {EditorState,TransactionSpec} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';

export interface PasteImage {placeholder:string;dataUrl:string;alt:string}

export function pasteText(state:EditorState,text:string):TransactionSpec{
 return {...state.replaceSelection(text),userEvent:'input.paste',annotations:isolateHistory.of('full'),scrollIntoView:true};
}

export function replacePasteImage(state:EditorState,placeholder:string,text:string):TransactionSpec{
 const from=state.doc.toString().indexOf(placeholder);if(from<0)return {};
 return {changes:{from,to:from+placeholder.length,insert:text},userEvent:'input.type.compose',annotations:isolateHistory.of('after')};
}

// The page's CSP (connect-src 'self') blocks fetch() of data: URLs, so decode them here.
export function dataUrlBlob(url:string):Blob{
 const match=/^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);if(!match)throw Error(messages.fTheImageCouldNotBeRead());
 const bytes=/;base64/i.test(match[2])?Uint8Array.from(atob(match[3].replace(/\s/g,'')),char=>char.charCodeAt(0)):new TextEncoder().encode(decodeURIComponent(match[3]));
 return new Blob([bytes],{type:match[1]||'application/octet-stream'});
}
