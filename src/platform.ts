// Key names follow Windows conventions.
const platform=typeof navigator==='undefined'?'':navigator.platform||'';
export const windows=/^Win/.test(platform);
const keyMap:Record<string,string>={Mod:'Ctrl'};
export function keyLabel(keys:string){
 const parts=keys.endsWith('++')?[...keys.slice(0,-2).split('+'),'+']:keys.split('+');
 return parts.map(p=>keyMap[p]||p).join('+');
}
export const redoKeys='Mod+Y';
