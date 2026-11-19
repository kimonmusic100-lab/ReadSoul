# ReadSoul

> 轻量级桌面端 Markdown 阅读与写作应用（v0.1.3），基于 **Tauri 2 + Rust + TypeScript + CodeMirror 6** 构建。

## 核心特性

- **即时排版编辑**：支持常见 Markdown 语法输入即时渲染、`/` 斜杠块级命令菜单、表格实时编辑、KaTeX 数学公式与 Mermaid 图表绘制。
- **自由图片与排版环绕**：支持本地图片插入、拖拽移动、实时正文环绕以及尺寸调整。
- **多文件夹本地库（「库」面板）**：支持挂载多个本地文件夹，按树状层级浏览并快速切换、创建或检索文档（「云端」能力已预留入口占位）。
- **全局与文档内搜索**：支持跨历史与已挂载本地库的关键词检索，以及文稿内查找与替换。
- **主题与外观定制**：支持浅色 (`onelight`) 与深色 (`indigo`) 主题及跟随系统切换，支持字号、行宽与字体配置。
- **多格式导入导出**：支持 HTML / Word (`.docx`) / PDF 打印导出及本地草稿自动保存与恢复。

## 技术栈

- **桌面端壳与本地持久化**：Tauri 2、Rust、`rusqlite`（内置 SQLite3 存储历史与索引）
- **前端与编辑器**：原生 TypeScript、Vite、CodeMirror 6、`markdown-it`、`katex`、`mermaid`、`dompurify`、`docx`、`turndown`

## 目录结构

```text
├── index.html          # 应用入口 HTML
├── locales.ts          # 界面本地化文案
├── src/                # 前端核心源码（编辑器、库树、搜索、导出、样式等）
├── src-tauri/          # Tauri Rust 后端源码与构建配置
├── web/                # 静态资源（Logo、字数统计 Worker）
└── scripts/            # 图标生成辅助脚本
```

## 本地开发与构建

前置环境：Node.js 20+、Rust 工具链（用于构建桌面端）。

```bash
# 安装依赖
npm install

# 类型检查
npm run check

# 启动前端开发服务器（仅界面预览）
npm run dev

# 启动桌面端开发调试
npm run tauri dev

# 构建前端静态产物
npm run build

# 构建 Windows Release 安装包
npx tauri build
```

## 开源许可

[MIT](LICENSE)
