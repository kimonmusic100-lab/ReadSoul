import {LanguageDescription,LanguageSupport,StreamLanguage,type StreamParser} from '@codemirror/language';

const legacy=(parser:StreamParser<unknown>)=>new LanguageSupport(StreamLanguage.define(parser));

// Lightweight syntax highlighting covering 30+ common languages via @codemirror/legacy-modes (~150 KB total vs 1 MB+ full language-data).
export const codeLanguages:readonly LanguageDescription[]=[
 LanguageDescription.of({name:'JavaScript',alias:['js','mjs','cjs','jsx','ecmascript','node'],extensions:['js','mjs','cjs','jsx'],load:()=>import('@codemirror/legacy-modes/mode/javascript').then(m=>legacy(m.javascript))}),
 LanguageDescription.of({name:'TypeScript',alias:['ts','mts','cts','tsx'],extensions:['ts','mts','cts','tsx'],load:()=>import('@codemirror/legacy-modes/mode/javascript').then(m=>legacy(m.typescript))}),
 LanguageDescription.of({name:'JSON',alias:['jsonc','json5'],extensions:['json'],load:()=>import('@codemirror/legacy-modes/mode/javascript').then(m=>legacy(m.json))}),
 LanguageDescription.of({name:'HTML',alias:['htm','xhtml','vue'],extensions:['html','htm','vue'],load:()=>import('@codemirror/legacy-modes/mode/xml').then(m=>legacy(m.html))}),
 LanguageDescription.of({name:'XML',alias:['svg','plist'],extensions:['xml','svg'],load:()=>import('@codemirror/legacy-modes/mode/xml').then(m=>legacy(m.xml))}),
 LanguageDescription.of({name:'CSS',extensions:['css'],load:()=>import('@codemirror/legacy-modes/mode/css').then(m=>legacy(m.css))}),
 LanguageDescription.of({name:'SCSS',alias:['sass'],extensions:['scss','sass'],load:()=>import('@codemirror/legacy-modes/mode/css').then(m=>legacy(m.sCSS))}),
 LanguageDescription.of({name:'Less',extensions:['less'],load:()=>import('@codemirror/legacy-modes/mode/css').then(m=>legacy(m.less))}),
 LanguageDescription.of({name:'Python',alias:['py','python3'],extensions:['py'],load:()=>import('@codemirror/legacy-modes/mode/python').then(m=>legacy(m.python))}),
 LanguageDescription.of({name:'Rust',alias:['rs'],extensions:['rs'],load:()=>import('@codemirror/legacy-modes/mode/rust').then(m=>legacy(m.rust))}),
 LanguageDescription.of({name:'Go',alias:['golang'],extensions:['go'],load:()=>import('@codemirror/legacy-modes/mode/go').then(m=>legacy(m.go))}),
 LanguageDescription.of({name:'SQL',alias:['mysql','postgresql','postgres','sqlite'],extensions:['sql'],load:()=>import('@codemirror/legacy-modes/mode/sql').then(m=>legacy(m.standardSQL))}),
 LanguageDescription.of({name:'YAML',alias:['yml'],extensions:['yaml','yml'],load:()=>import('@codemirror/legacy-modes/mode/yaml').then(m=>legacy(m.yaml))}),
 LanguageDescription.of({name:'TOML',alias:['ini'],extensions:['toml','ini'],load:()=>import('@codemirror/legacy-modes/mode/toml').then(m=>legacy(m.toml))}),
 LanguageDescription.of({name:'C',extensions:['c','h'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.c))}),
 LanguageDescription.of({name:'C++',alias:['cpp','cc','cxx','hpp'],extensions:['cpp','cc','cxx','hpp'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.cpp))}),
 LanguageDescription.of({name:'Java',extensions:['java'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.java))}),
 LanguageDescription.of({name:'C#',alias:['cs','csharp'],extensions:['cs'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.csharp))}),
 LanguageDescription.of({name:'Kotlin',alias:['kt','kts'],extensions:['kt','kts'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.kotlin))}),
 LanguageDescription.of({name:'Scala',extensions:['scala'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.scala))}),
 LanguageDescription.of({name:'Dart',extensions:['dart'],load:()=>import('@codemirror/legacy-modes/mode/clike').then(m=>legacy(m.dart))}),
 LanguageDescription.of({name:'Shell',alias:['bash','sh','zsh'],extensions:['sh','bash','zsh'],load:()=>import('@codemirror/legacy-modes/mode/shell').then(m=>legacy(m.shell))}),
 LanguageDescription.of({name:'PowerShell',alias:['ps1','pwsh','ps'],extensions:['ps1'],load:()=>import('@codemirror/legacy-modes/mode/powershell').then(m=>legacy(m.powerShell))}),
 LanguageDescription.of({name:'Diff',alias:['patch'],extensions:['diff','patch'],load:()=>import('@codemirror/legacy-modes/mode/diff').then(m=>legacy(m.diff))}),
 LanguageDescription.of({name:'Dockerfile',alias:['docker'],extensions:['dockerfile'],load:()=>import('@codemirror/legacy-modes/mode/dockerfile').then(m=>legacy(m.dockerFile))}),
 LanguageDescription.of({name:'Ruby',alias:['rb'],extensions:['rb'],load:()=>import('@codemirror/legacy-modes/mode/ruby').then(m=>legacy(m.ruby))}),
 LanguageDescription.of({name:'Swift',extensions:['swift'],load:()=>import('@codemirror/legacy-modes/mode/swift').then(m=>legacy(m.swift))}),
 LanguageDescription.of({name:'Lua',extensions:['lua'],load:()=>import('@codemirror/legacy-modes/mode/lua').then(m=>legacy(m.lua))}),
 LanguageDescription.of({name:'Nginx',alias:['conf'],extensions:['conf'],load:()=>import('@codemirror/legacy-modes/mode/nginx').then(m=>legacy(m.nginx))}),
];
