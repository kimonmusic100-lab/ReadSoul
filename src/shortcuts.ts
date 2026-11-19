import {redoKeys} from './platform';
// The toolbar's keys, in Windows notation. The tooltips, the heading menu and the key handler read them here.
export const shortcuts:Record<string,string>={undo:'Mod+Z',redo:redoKeys,paragraph:'Mod+0',h1:'Mod+1',h2:'Mod+2',h3:'Mod+3',h4:'Mod+4',h5:'Mod+5',h6:'Mod+6',bold:'Mod+B',italic:'Mod+I',underline:'Mod+U',strike:'Mod+Shift+X',highlight:'Mod+Shift+H',inlineCode:'Mod+E',ordered:'Mod+Shift+7',bullet:'Mod+Shift+8',task:'Mod+Shift+9',outdent:'Shift+Tab',indent:'Tab',link:'Mod+L',find:'Mod+F'};
// CodeMirror handles undo, redo, find and list indents; the key handler matches the rest.
const matched=['paragraph','h1','h2','h3','h4','h5','h6','bold','italic','underline','strike','highlight','inlineCode','ordered','bullet','task','link'];
type Keys=Pick<KeyboardEvent,'key'|'code'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'>;
// Mod is Ctrl on Windows. Shift must agree and Alt stays up, as Ctrl+Alt is AltGr on Windows.
// Letters go by the character typed, digits by the key, because Shift+7 types &; keypad digits do not count.
export function shortcutAction(e:Keys):string|undefined{
 if(e.altKey||!e.ctrlKey||e.metaKey)return;
 const key=/^Digit(\d)$/.exec(e.code)?.[1]||(/^[a-z]$/i.test(e.key)?e.key.toUpperCase():'');
 const keys=(e.shiftKey?'Mod+Shift+':'Mod+')+key;
 return key?matched.find(id=>shortcuts[id]===keys):undefined;
}
// The same keys as aria-keyshortcuts names them: Control+Shift+X.
export function ariaKeys(keys:string){return keys.split('+').map(part=>part==='Mod'?'Control':part).join('+')}
