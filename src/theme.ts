import list from './themes.json';
import type {Appearance} from './types';
const themeIDs=['onelight','indigo'] as const;
export type ThemeID=typeof themeIDs[number];
export type AutoSwitch='off'|'system';
export interface ThemeSpec {id:ThemeID;dark:boolean}
export const themes=list as ThemeSpec[];
const known=(id:unknown):id is ThemeID=>themes.some(t=>t.id===id);
export const isDark=(id:string)=>themes.some(t=>t.id===id&&t.dark);
export type ThemeChoice=Partial<Pick<Appearance,'theme'|'auto'|'lightTheme'|'darkTheme'|'followSystem'>>;
export function resolveTheme(p:ThemeChoice,_now:Date,systemDark:boolean):ThemeID{
 const auto:string=p.auto||(p.followSystem?'system':'off');
 if(auto==='system'||auto==='hours'||auto==='seasons')return systemDark?'indigo':'onelight';
 return known(p.theme)?p.theme:'onelight';
}
export function paintTheme(root:HTMLElement,id:ThemeID){const scheme=isDark(id)?'dark':'light';root.dataset.readsoulTheme=id;root.dataset.readsoulScheme=scheme;root.style.colorScheme=scheme}
export function watchTheme(update:()=>void){const mq=matchMedia('(prefers-color-scheme:dark)');mq.addEventListener('change',update);addEventListener('focus',update);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});setInterval(update,60000);return mq}
