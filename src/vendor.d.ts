/// <reference types="vite/client" />
declare const __APP_VERSION__:string;
declare module 'markdown-it-footnote';
declare module 'turndown-plugin-gfm' {
 import type TurndownService from 'turndown';
 export const gfm:TurndownService.Plugin;
}
