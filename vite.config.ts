import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface Position {
  anchor: number;
  head: number;
  scroll: number;
  source: boolean;
}

interface DocRecord {
  id: string;
  title: string;
  customTitle?: boolean;
  generatedTitleSuffix?: string;
  path: string;
  content: string;
  excerpt: string;
  status: string;
  statusCode: string;
  conflict: boolean;
  modified?: boolean;
  updated: number;
  revision: number;
  position: Position;
  imageAliases?: Record<string, string>;
}

interface Appearance {
  theme: string;
  auto: string;
  lightTheme: string;
  darkTheme: string;
  followSystem?: boolean;
  fontSize?: number;
  lineWidth?: 'normal' | 'wide' | 'full';
  layout?: 'single' | 'split' | 'read';
  source?: boolean;
  sidebarDocked?: boolean;
  outlineHidden?: boolean;
  autoSpace?: boolean;
}

const DATA_ROOT = path.resolve(process.cwd(), '.readsoul-data');
function ensureDataDirs(): void {
  for (const sub of ['drafts', 'trash', 'assets', 'quarantine']) {
    fs.mkdirSync(path.join(DATA_ROOT, sub), { recursive: true });
  }
}

function uid(): string {
  return crypto.randomBytes(8).toString('hex');
}

function msg(_locale: string, key: string): string {
  const map: Record<string, string> = {
    bUntitled: '未命名文稿',
    bStatusDraftSaved: '草稿已保存',
    bStatusFileSaved: '文件已保存',
    bStatusDiskConflict: '磁盘内容已变化，自动写入已暂停',
    bStatusSaveFailed: '保存失败，内容仍在编辑器',
    bDocumentMissing: '文稿不存在',
    bDocumentChanged: '文稿已变化，请重新载入，当前输入尚未保存',
    bInvalidDocument: '文稿超过 8 MB 或编码无效',
    bNameRequired: '请输入名称',
    bRenameExistingFile: '已有文件请通过另存命名',
    bSearchInvalidQuery: '请输入有效的搜索文字。',
    bSearchQueryTooLong: '搜索文字最多 128 个字符。',
    bSearchQueryLineBreak: '请搜索单行内连续的文字。',
    bFilterInvalidTag: '请输入有效标签，最多 80 个字，且不能包含控制字符。',
    bWikiInvalidName: '引用名称无效，请使用单行标题，最多 256 个字，且不能包含控制字符、方括号或竖线。',
    bWikiSourceChanged: '来源文稿已更新，请重新点击引用。',
    bWikiSourceMissing: '来源文稿已移除。',
  };
  return map[key] || key;
}

function frontMatterEnd(s: string): number {
  let firstEnd = 0;
  if (s.startsWith('---\n')) firstEnd = 4;
  else if (s.startsWith('---\r\n')) firstEnd = 5;
  else return 0;
  const lines = s.slice(firstEnd).split('\n');
  let offset = firstEnd;
  let hasProp = false;
  for (let i = 0; i < lines.length && i < 80; i++) {
    const rawLine = lines[i] + (i < lines.length - 1 ? '\n' : '');
    offset += rawLine.length;
    if (offset > 8192) return 0;
    const trimmed = lines[i].replace(/\r$/, '').trim();
    if (trimmed === '---' || trimmed === '...') return hasProp ? offset : 0;
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon > 0 && !/\s/.test(trimmed.slice(0, colon).trim())) hasProp = true;
  }
  return 0;
}

function cleanInline(s: string): string {
  let t = s.trim();
  for (const m of ['**', '__', '~~', '`', '*', '_']) t = t.split(m).join('');
  return t.replace(/\s+/g, ' ').trim();
}

function hasInferredTitle(s: string): boolean {
  const body = s.slice(frontMatterEnd(s));
  for (const raw of body.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('```') || t.startsWith('~~~') || /^[-*_]+$/.test(t)) continue;
    const cleaned = cleanInline(t.replace(/^[#>*+-]+\s*/, ''));
    if (cleaned) return true;
  }
  return false;
}

function inferredTitle(s: string, locale = 'zh-Hans'): string {
  const body = s.slice(frontMatterEnd(s));
  for (const raw of body.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('```') || t.startsWith('~~~') || /^[-*_]+$/.test(t)) continue;
    const cleaned = cleanInline(t.replace(/^[#>*+-]+\s*/, ''));
    if (cleaned) {
      const chars = Array.from(cleaned);
      return chars.length > 28 ? chars.slice(0, 28).join('') + '…' : cleaned;
    }
  }
  return msg(locale, 'bUntitled');
}

function excerptOf(s: string): string {
  const body = s.slice(frontMatterEnd(s));
  const out: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    let t = raw.trim();
    if (!t || t.startsWith('```') || t.startsWith('~~~')) continue;
    for (const p of ['- [ ] ', '- [x] ', '- [X] ', '- ', '* ', '+ ', '> ']) {
      if (t.startsWith(p)) t = t.slice(p.length);
    }
    t = cleanInline(t.replace(/^#+\s*/, ''));
    if (t) out.push(t);
    if (out.join(' ').length > 90) break;
  }
  const joined = out.join(' ');
  const chars = Array.from(joined);
  return chars.length > 54 ? chars.slice(0, 54).join('') + '…' : joined;
}

function extractTags(content: string): string[] {
  const end = frontMatterEnd(content);
  if (!end) return [];
  const lines = content.slice(0, end).split(/\r?\n/).slice(1, -1);
  const raw: string[] = [];
  let inSeq = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inSeq) {
      if (trimmed.startsWith('-')) {
        raw.push(trimmed.slice(1).trim().replace(/^['"]|['"]$/g, ''));
        continue;
      } else if (trimmed && !trimmed.startsWith('#')) {
        inSeq = false;
      }
    }
    if (trimmed.startsWith('tags:')) {
      const val = trimmed.slice(5).trim();
      if (!val) inSeq = true;
      else if (val.startsWith('[') && val.endsWith(']')) {
        for (const p of val.slice(1, -1).split(',')) {
          const item = p.trim().replace(/^['"]|['"]$/g, '');
          if (item) raw.push(item);
        }
      } else {
        const item = val.replace(/^['"]|['"]$/g, '');
        if (item) raw.push(item);
      }
    }
  }
  const seen = new Set<string>();
  const res: string[] = [];
  for (const r of raw) {
    const t = r.trim().replace(/^#+/, '').trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      res.push(t);
    }
  }
  return res;
}

function wikiName(s: string): string | null {
  let t = (s || '').trim();
  if (t.length > 3 && t.slice(-3).toLowerCase() === '.md') t = t.slice(0, -3).trim();
  t = t.replace(/\s+/g, ' ');
  if (!t || Array.from(t).length > 256 || /[\[\]|]/.test(t) || /[\x00-\x1f\x7f]/.test(t)) return null;
  return t;
}

function searchHits(content: string, positions: [number, number][]) {
  return positions.map(([from, to]) => {
    const lineStart = content.lastIndexOf('\n', from - 1) + 1;
    let lineEnd = content.indexOf('\n', to);
    if (lineEnd === -1) lineEnd = content.length;
    if (lineEnd > lineStart && content[lineEnd - 1] === '\r') lineEnd--;
    let line = 1;
    for (let i = 0; i < lineStart; i++) if (content[i] === '\n') line++;
    const beforeFull = content.slice(lineStart, from);
    const textFull = content.slice(from, Math.min(to, lineEnd));
    const afterFull = to < lineEnd ? content.slice(to, lineEnd) : '';
    const bChars = Array.from(beforeFull);
    const tChars = Array.from(textFull);
    const aChars = Array.from(afterFull);
    return {
      from,
      to,
      line,
      before: bChars.length > 28 ? '…' + bChars.slice(-28).join('') : beforeFull,
      text: tChars.length > 80 ? tChars.slice(0, 80).join('') + '…' : textFull,
      after: aChars.length > 52 ? aChars.slice(0, 52).join('') + '…' : afterFull,
    };
  });
}

function findMatches(text: string, query: string, limit: number): [number, number][] {
  if (!query || limit <= 0) return [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out: [number, number][] = [];
  let idx = 0;
  while (idx <= lower.length - q.length) {
    const found = lower.indexOf(q, idx);
    if (found === -1) break;
    out.push([found, found + q.length]);
    if (out.length >= limit) break;
    idx = found + q.length;
  }
  return out;
}

function readsoulApiPlugin(): Plugin {
  const docs = new Map<string, DocRecord>();
  let currentID = '';
  let folders: string[] = [];
  let appearance: Appearance = {
    theme: 'onelight',
    auto: 'system',
    lightTheme: 'onelight',
    darkTheme: 'indigo',
    followSystem: true,
    fontSize: 18,
    lineWidth: 'normal',
    layout: 'read',
    source: false,
    sidebarDocked: false,
    outlineHidden: false,
    autoSpace: true,
  };

  const draftsDir = path.join(DATA_ROOT, 'drafts');
  const idxPath = path.join(DATA_ROOT, 'workspace.json');
  let workspaceInitialized = false;

  function initWorkspaceFromDisk(): void {
    if (workspaceInitialized) return;
    workspaceInitialized = true;
    ensureDataDirs();
    for (const f of fs.readdirSync(draftsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf8')) as DocRecord;
        if (d && d.id) {
          if (!d.position || typeof d.position.anchor !== 'number') {
            d.position = { anchor: 0, head: 0, scroll: 0, source: false };
          }
          docs.set(d.id, d);
        }
      } catch {}
    }

    if (fs.existsSync(idxPath)) {
      try {
        const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        if (idx.current) currentID = idx.current;
        if (idx.appearance) {
          appearance = { ...appearance, ...idx.appearance };
          if (appearance.theme !== 'onelight' && appearance.theme !== 'indigo') appearance.theme = 'onelight';
          appearance.lightTheme = 'onelight';
          appearance.darkTheme = 'indigo';
          if ((appearance.lineWidth as string) === 'comfortable') appearance.lineWidth = 'normal';
          if ((appearance.layout as string) === 'edit') appearance.layout = 'single';
        }
        if (Array.isArray(idx.folders)) {
          folders = Array.from(new Set(idx.folders.map((x: unknown) => String(x || '').trim()).filter(Boolean)));
        }
      } catch {}
    }

    if (docs.size === 0) {
      currentID = createDraft().id;
      saveIndex();
    } else if (!docs.has(currentID)) {
      const sorted = Array.from(docs.values()).sort((a, b) => b.updated - a.updated);
      currentID = sorted[0].id;
      saveIndex();
    }
  }

  function persistDoc(d: DocRecord) {
    d.excerpt = excerptOf(d.content);
    if (!d.path && !d.customTitle) d.title = inferredTitle(d.content, 'zh-Hans');
    fs.writeFileSync(path.join(draftsDir, `${d.id}.json`), JSON.stringify(d, null, 2));
  }

  function saveIndex() {
    fs.writeFileSync(
      idxPath,
      JSON.stringify({ version: 1, current: currentID, appearance, folders }, null, 2)
    );
  }

  function createDraft(): DocRecord {
    const d: DocRecord = {
      id: uid(),
      title: '未命名文稿',
      customTitle: false,
      path: '',
      content: '',
      excerpt: '',
      status: '草稿已保存',
      statusCode: 'draftSaved',
      conflict: false,
      updated: Date.now(),
      revision: 0,
      position: { anchor: 0, head: 0, scroll: 0, source: false },
    };
    persistDoc(d);
    docs.set(d.id, d);
    return d;
  }

  function localizeDoc(d: DocRecord, locale: string): DocRecord {
    const copy = { ...d };
    if (!copy.path && !copy.customTitle && !hasInferredTitle(copy.content)) {
      copy.title = msg(locale, 'bUntitled');
    }
    copy.status = msg(locale, copy.statusCode === 'fileSaved' ? 'bStatusFileSaved' : 'bStatusDraftSaved');
    return copy;
  }

  function summaryOf(d: DocRecord, locale: string) {
    const loc = localizeDoc(d, locale);
    return {
      id: loc.id,
      title: loc.title,
      path: loc.path,
      updated: loc.updated,
      excerpt: loc.excerpt || excerptOf(loc.content),
      tags: extractTags(loc.content),
    };
  }

  function getState(locale: string) {
    const cur = docs.get(currentID) || createDraft();
    const recent = Array.from(docs.values())
      .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
      .map(d => summaryOf(d, locale));
    return {
      current: localizeDoc(cur, locale),
      recent,
      appearance,
    };
  }

  function wikiTitle(d: DocRecord): string | null {
    const name = wikiName(d.title);
    if (!name || name !== d.title || (!d.path && !d.customTitle && !hasInferredTitle(d.content))) {
      return null;
    }
    return d.title;
  }

  function handleRpc(method: string, args: any[], locale: string): any {
    switch (method) {
      case 'State':
        return getState(locale);
      case 'Update': {
        const edit = args[0] || {};
        const d = docs.get(edit.id);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        if (typeof edit.revision === 'number' && edit.revision >= 0 && edit.revision !== d.revision && !edit.force) {
          throw new Error(msg(locale, 'bDocumentChanged'));
        }
        const changed = d.content !== edit.content;
        d.content = String(edit.content ?? '');
        if (edit.position) d.position = edit.position;
        if (changed || edit.force) {
          d.updated = Date.now();
          d.revision += 1;
        }
        d.statusCode = d.path ? 'fileSaved' : 'draftSaved';
        if (d.path) {
          try {
            fs.writeFileSync(d.path, d.content, 'utf8');
          } catch {}
        }
        persistDoc(d);
        return localizeDoc(d, locale);
      }
      case 'SavePosition': {
        const d = docs.get(args[0]);
        if (d && args[1]) {
          d.position = args[1];
          persistDoc(d);
        }
        return null;
      }
      case 'New': {
        const d = createDraft();
        currentID = d.id;
        saveIndex();
        return getState(locale);
      }
      case 'Activate':
      case 'ActivateSearch': {
        const id = args[0];
        const d = docs.get(id);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        if (method === 'ActivateSearch' && typeof args[1] === 'number' && args[1] >= 0 && d.revision !== args[1]) {
          throw new Error(msg(locale, 'bDocumentChanged'));
        }
        currentID = id;
        saveIndex();
        return getState(locale);
      }
      case 'Delete': {
        const id = args[0];
        const d = docs.get(id);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        docs.delete(id);
        try {
          fs.unlinkSync(path.join(draftsDir, `${id}.json`));
        } catch {}
        if (docs.size === 0) {
          currentID = createDraft().id;
        } else if (currentID === id) {
          currentID = Array.from(docs.values()).sort((a, b) => b.updated - a.updated)[0].id;
        }
        saveIndex();
        return getState(locale);
      }
      case 'Status': {
        const d = docs.get(args[0]);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        const loc = localizeDoc(d, locale);
        return {
          id: loc.id,
          revision: loc.revision,
          conflict: loc.conflict,
          status: loc.status,
          statusCode: loc.statusCode,
        };
      }
      case 'Rename': {
        const d = docs.get(args[0]);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        if (d.path) throw new Error(msg(locale, 'bRenameExistingFile'));
        const cleaned = cleanInline(String(args[1] || ''));
        if (!cleaned) throw new Error(msg(locale, 'bNameRequired'));
        d.title = Array.from(cleaned).slice(0, 60).join('');
        d.customTitle = true;
        d.updated = Date.now();
        d.revision += 1;
        persistDoc(d);
        return getState(locale);
      }
      case 'UpdateAppearance': {
        appearance = { ...appearance, ...(args[0] || {}) };
        saveIndex();
        return appearance;
      }
      case 'FilterDocuments': {
        const req = args[0] || {};
        const q = String(req.query || '').trim();
        const tag = String(req.tag || '').trim();
        const loc = args[1] || locale;
        const counts = new Map<string, number>();
        const selected: DocRecord[] = [];
        for (const d of docs.values()) {
          const tags = extractTags(d.content);
          for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
          if (!tag || tags.includes(tag)) selected.push(d);
        }
        const tagList = Array.from(counts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, count]) => ({ name, count }));
        if (!q && !tag) {
          const recent = Array.from(docs.values())
            .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
            .map(d => summaryOf(d, loc));
          return { items: [], total: 0, truncated: false, tags: tagList, recent };
        }
        const items: any[] = [];
        for (const raw of selected) {
          const d = localizeDoc(raw, loc);
          const tMatches = q ? findMatches(d.title, q, 1) : [];
          const cMatches = q ? findMatches(d.content, q, 4) : [];
          if (q && !tMatches.length && !cMatches.length) continue;
          items.push({
            document: {
              id: d.id,
              title: d.title,
              path: d.path,
              updated: d.updated,
              revision: d.revision,
              titleMatch: tMatches.length ? { from: tMatches[0][0], to: tMatches[0][1] } : null,
              hits: searchHits(d.content, cMatches.slice(0, 3)),
              moreHits: cMatches.length > 3,
            },
            tags: extractTags(d.content),
            excerpt: q ? '' : d.excerpt || excerptOf(d.content),
          });
        }
        items.sort(
          (a, b) =>
            Number(!!b.document.titleMatch) - Number(!!a.document.titleMatch) ||
            b.document.updated - a.document.updated
        );
        return {
          items: items.slice(0, 100),
          total: items.length,
          truncated: items.length > 100,
          tags: tagList,
          recent: [],
        };
      }
      case 'ResolveWikiLink': {
        const req = args[0] || {};
        const loc = args[1] || locale;
        const source = docs.get(req.sourceID);
        if (!source) throw new Error(msg(loc, 'bWikiSourceMissing'));
        if (source.revision !== req.revision) throw new Error(msg(loc, 'bWikiSourceChanged'));
        const target = wikiName(req.target);
        if (!target) throw new Error(msg(loc, 'bWikiInvalidName'));
        const candidates = Array.from(docs.values())
          .filter(d => wikiTitle(d) === target)
          .sort((a, b) => b.updated - a.updated);
        return {
          items: candidates.slice(0, 100).map(raw => {
            const d = localizeDoc(raw, loc);
            return {
              id: d.id,
              title: d.title,
              path: d.path,
              updated: d.updated,
              revision: d.revision,
              titleMatch: null,
              hits: [],
              moreHits: false,
            };
          }),
          total: candidates.length,
          truncated: candidates.length > 100,
        };
      }
      case 'Delivery': {
        const d = docs.get(args[0]);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        const images: Record<string, string> = {};
        const assetDir = path.join(DATA_ROOT, 'assets', d.id);
        if (fs.existsSync(assetDir)) {
          for (const name of fs.readdirSync(assetDir)) {
            const p = path.join(assetDir, name);
            if (!fs.statSync(p).isFile()) continue;
            const buf = fs.readFileSync(p);
            const mime = name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.gif') ? 'image/gif' : 'image/png';
            images[`readsoul-asset:${name}`] = `data:${mime};base64,${buf.toString('base64')}`;
          }
        }
        const missing: string[] = [];
        let external = 0;
        const imgRefs = new Set<string>();
        for (const m of d.content.matchAll(/!\[[^\]]*\]\(([^)\s]+)|<img[^>]*src=["']([^"']+)["']/gi)) {
          const ref = (m[1] || m[2] || '').trim();
          if (ref) imgRefs.add(ref);
        }
        for (const ref of imgRefs) {
          if (ref.startsWith('data:') || ref.startsWith('blob:')) continue;
          if (/^https?:\/\//i.test(ref)) {
            external++;
            continue;
          }
          if (ref.startsWith('readsoul-asset:')) {
            if (!images[ref]) missing.push(ref);
            continue;
          }
          if (d.path) {
            const rel = path.resolve(path.dirname(d.path), decodeURIComponent(ref));
            if (fs.existsSync(rel) && fs.statSync(rel).isFile()) {
              const buf = fs.readFileSync(rel);
              const ext = path.extname(rel).toLowerCase();
              const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'image/png';
              images[ref] = `data:${mime};base64,${buf.toString('base64')}`;
              continue;
            }
          }
          missing.push(ref);
        }
        return { title: d.title, content: d.content, images, missing, external };
      }
      case 'ImportImage': {
        const [id, , encoded] = args;
        const d = docs.get(id);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        const buf = Buffer.from(String(encoded || ''), 'base64');
        const ext = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf[0] === 0x47 ? 'gif' : 'png';
        const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'png' ? 'image/png' : 'image/png';
        const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24);
        const name = `${hash}.${ext}`;
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        if (d.path) {
          try {
            const relDir = path.join(path.dirname(d.path), 'assets');
            fs.mkdirSync(relDir, { recursive: true });
            fs.writeFileSync(path.join(relDir, name), buf);
            const dest = `assets/${name}`;
            return { destination: dest, url: dataUrl, name, markdown: dest };
          } catch {}
        }
        const assetDir = path.join(DATA_ROOT, 'assets', id);
        fs.mkdirSync(assetDir, { recursive: true });
        fs.writeFileSync(path.join(assetDir, name), buf);
        const dest = `readsoul-asset:${name}`;
        return { destination: dest, url: dataUrl, name, markdown: dest };
      }
      case 'ReadImage': {
        const [id, dest] = args;
        const d = docs.get(id);
        if (!d) throw new Error(msg(locale, 'bDocumentMissing'));
        const rawDest = String(dest || '');
        const p = rawDest.startsWith('readsoul-asset:')
          ? path.join(DATA_ROOT, 'assets', id, rawDest.replace(/^readsoul-asset:/, ''))
          : d.path
            ? path.resolve(path.dirname(d.path), decodeURIComponent(rawDest))
            : '';
        if (!p || !fs.existsSync(p)) throw new Error('Image not found');
        const buf = fs.readFileSync(p);
        const mime = p.endsWith('.jpg') || p.endsWith('.jpeg') ? 'image/jpeg' : p.endsWith('.gif') ? 'image/gif' : 'image/png';
        return { destination: dest, url: `data:${mime};base64,${buf.toString('base64')}`, name: path.basename(p), markdown: dest };
      }
      case 'OpenFile': {
        const filePath = path.resolve(String(args[0] || ''));
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          throw new Error(msg(locale, 'bDocumentMissing'));
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const existing = Array.from(docs.values()).find(
          (x) => x.path && x.path.toLowerCase() === filePath.toLowerCase()
        );
        const title = path.basename(filePath, path.extname(filePath)) || '未命名文稿';
        if (existing) {
          if (existing.content !== content) {
            existing.content = content;
            existing.revision += 1;
          }
          existing.title = title;
          existing.customTitle = true;
          existing.updated = Date.now();
          existing.statusCode = 'fileSaved';
          persistDoc(existing);
          currentID = existing.id;
        } else {
          const rec: DocRecord = {
            id: uid(),
            title,
            customTitle: true,
            path: filePath,
            content,
            excerpt: excerptOf(content),
            status: msg(locale, 'bStatusFileSaved'),
            statusCode: 'fileSaved',
            conflict: false,
            updated: Date.now(),
            revision: 1,
            position: { anchor: 0, head: 0, scroll: 0, source: false },
          };
          persistDoc(rec);
          docs.set(rec.id, rec);
          currentID = rec.id;
        }
        saveIndex();
        return getState(locale);
      }
      case 'AddFolder': {
        const dirPath = path.resolve(String(args[0] || ''));
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
          throw new Error(msg(locale, 'bDocumentMissing'));
        }
        if (!folders.some((f) => f.toLowerCase() === dirPath.toLowerCase())) {
          folders.push(dirPath);
          saveIndex();
        }
        return scanAllFolders();
      }
      case 'RemoveFolder': {
        const dirPath = path.resolve(String(args[0] || ''));
        folders = folders.filter((f) => f.toLowerCase() !== dirPath.toLowerCase());
        saveIndex();
        return scanAllFolders();
      }
      case 'ScanFolders':
        return scanAllFolders();
      case 'CreateInFolder': {
        const [parentDir, rawName, kind] = args;
        const name = String(rawName || '').trim();
        if (!name || /[\/\\:*?"<>|]/.test(name)) throw new Error('文件名包含非法字符');
        const targetDir = path.resolve(String(parentDir || ''));
        if (kind === 'dir') {
          fs.mkdirSync(path.join(targetDir, name), { recursive: true });
          return { folders: scanAllFolders() };
        }
        const fileName = /\.(md|markdown|txt)$/i.test(name) ? name : `${name}.md`;
        const target = path.join(targetDir, fileName);
        if (fs.existsSync(target)) throw new Error('文件已存在');
        const stem = path.basename(fileName, path.extname(fileName));
        fs.writeFileSync(target, `# ${stem}\n\n`, 'utf8');
        const st = handleRpc('OpenFile', [target], locale);
        return { folders: scanAllFolders(), state: st };
      }
      case 'RenameFsItem': {
        const oldPath = path.resolve(String(args[0] || ''));
        const newName = String(args[1] || '').trim();
        if (!newName || /[\/\\:*?"<>|]/.test(newName)) throw new Error('名称不合法');
        const isFile = fs.statSync(oldPath).isFile();
        const finalName = isFile && !newName.includes('.') ? `${newName}${path.extname(oldPath) || '.md'}` : newName;
        const nextPath = path.join(path.dirname(oldPath), finalName);
        fs.renameSync(oldPath, nextPath);
        let affected = false;
        for (const d of docs.values()) {
          if (d.path && d.path.toLowerCase() === oldPath.toLowerCase()) {
            d.path = nextPath;
            d.title = path.basename(nextPath, path.extname(nextPath));
            persistDoc(d);
            affected = true;
          }
        }
        return { folders: scanAllFolders(), state: affected ? getState(locale) : undefined };
      }
      case 'TrashFsItem': {
        const target = path.resolve(String(args[0] || ''));
        const trashDest = path.join(DATA_ROOT, 'trash', `${Date.now()}-${path.basename(target)}`);
        fs.renameSync(target, trashDest);
        let st: any;
        for (const [id, d] of Array.from(docs.entries())) {
          if (d.path && d.path.toLowerCase() === target.toLowerCase()) {
            st = handleRpc('Delete', [id], locale);
          }
        }
        return { folders: scanAllFolders(), state: st };
      }
      case 'GlobalSearch': {
        const t0 = Date.now();
        const q = String(args[0] || '').trim();
        const limit = Number(args[1] || 60);
        const corpus: Array<{ key: string; docId: string; title: string; path: string; content: string }> = [];
        const openPaths = new Set<string>();
        for (const d of docs.values()) {
          const key = d.path ? d.path.toLowerCase() : `doc:${d.id}`;
          if (d.path) openPaths.add(key);
          corpus.push({ key, docId: d.id, title: d.title, path: d.path, content: d.content });
        }
        const walkIndex = (dir: string, depth = 0) => {
          if (depth > 10 || corpus.length > 3000 || !fs.existsSync(dir)) return;
          for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ent.name.startsWith('.') || ['node_modules', 'target', 'dist'].includes(ent.name)) continue;
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) walkIndex(full, depth + 1);
            else if (ent.isFile() && /\.(md|markdown|txt)$/i.test(ent.name)) {
              const k = full.toLowerCase();
              if (openPaths.has(k)) continue;
              openPaths.add(k);
              try {
                corpus.push({
                  key: k,
                  docId: '',
                  title: path.basename(full, path.extname(full)),
                  path: full,
                  content: fs.readFileSync(full, 'utf8'),
                });
              } catch {}
            }
          }
        };
        for (const f of folders) walkIndex(f);
        const hits: any[] = [];
        if (q) {
          const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
          for (const item of corpus) {
            const lines = item.content.split(/\r?\n/);
            let curHeading = '';
            let matched = false;
            for (let i = 0; i < lines.length; i++) {
              const ln = lines[i];
              const hMatch = /^#{1,6}\s+(.*)$/.exec(ln);
              if (hMatch) curHeading = hMatch[1].trim();
              const lower = ln.toLowerCase();
              if (terms.every((t) => lower.includes(t) || item.title.toLowerCase().includes(t))) {
                const idx = lower.indexOf(terms[0]);
                const parts = idx >= 0
                  ? [
                      ...(idx > 0 ? [{ text: ln.slice(Math.max(0, idx - 24), idx), highlight: false }] : []),
                      { text: ln.slice(idx, idx + terms[0].length), highlight: true },
                      ...(idx + terms[0].length < ln.length
                        ? [{ text: ln.slice(idx + terms[0].length, idx + terms[0].length + 60), highlight: false }]
                        : []),
                    ]
                  : [{ text: ln.slice(0, 80) || item.title, highlight: true }];
                hits.push({
                  key: item.key,
                  docId: item.docId,
                  title: item.title,
                  path: item.path,
                  heading: curHeading,
                  line: i + 1,
                  parts,
                  score: idx >= 0 ? 10 : 5,
                });
                matched = true;
                break;
              }
            }
            if (!matched && terms.every((t) => item.title.toLowerCase().includes(t))) {
              hits.push({
                key: item.key,
                docId: item.docId,
                title: item.title,
                path: item.path,
                heading: '',
                line: 1,
                parts: [{ text: item.title, highlight: true }],
                score: 4,
              });
            }
            if (hits.length >= limit) break;
          }
        }
        return {
          hits,
          indexedFiles: corpus.length,
          indexedBlocks: corpus.reduce((s, c) => s + Math.max(1, c.content.split(/\n#{1,6}\s+/).length), 0),
          elapsedMs: Date.now() - t0,
        };
      }
      default:
        return null;
    }
  }

  function scanAllFolders() {
    const docMap = new Map<string, string>();
    for (const d of docs.values()) {
      if (d.path) docMap.set(d.path.toLowerCase(), d.id);
    }
    const scanDir = (dir: string, depth = 0): any[] => {
      if (depth >= 12 || !fs.existsSync(dir)) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const dirs: any[] = [];
      const files: any[] = [];
      for (const ent of entries) {
        if (ent.name.startsWith('.') || ['node_modules', 'target', 'dist'].includes(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          dirs.push({ name: ent.name, path: full, isDir: true, children: scanDir(full, depth + 1) });
        } else if (ent.isFile() && /\.(md|markdown|txt)$/i.test(ent.name)) {
          files.push({ name: ent.name, path: full, isDir: false, docId: docMap.get(full.toLowerCase()) || '' });
        }
      }
      dirs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      files.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      return [...dirs, ...files];
    };
    return folders.map((f) => ({
      path: f,
      name: path.basename(f) || f,
      nodes: scanDir(f),
    }));
  }

  const attachApiMiddleware = (middlewares: { use: (route: string, fn: any) => void }) => {
    initWorkspaceFromDisk();
    middlewares.use('/api', (req: any, res: any, next: any) => {
      if (req.method !== 'POST') return next();
      let body = '';
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const payload = JSON.parse(body || '{}');
          const value = handleRpc(payload.method, payload.args || [], payload.locale || 'zh-Hans');
          res.end(JSON.stringify({ value }));
        } catch (err: any) {
          res.end(JSON.stringify({ error: err?.message || String(err) }));
        }
      });
    });
  };

  return {
    name: 'readsoul-api-middleware',
    generateBundle(_, bundle) {
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (fileName.endsWith('.css') && asset.type === 'asset' && typeof asset.source === 'string') {
          asset.source = asset.source.replace(
            /,\s*url\([^)]+\.(?:woff|ttf)\)\s*format\(["'](?:woff|truetype)["']\)/g,
            ''
          );
          // Drop rare KaTeX @font-face rules whose woff2 assets are pruned below.
          asset.source = asset.source.replace(
            /@font-face\{[^}]*KaTeX_(?:Fraktur|Caligraphic|Script|SansSerif|Typewriter|Size3|Size4)[^}]*\}/g,
            ''
          );
        }
        if (
          /^assets\/.*\.(?:woff|ttf)$/i.test(fileName) ||
          /^assets\/KaTeX_(?:Fraktur|Caligraphic|Script|SansSerif|Typewriter|Size3|Size4)-.*\.woff2$/i.test(fileName)
        ) {
          delete bundle[fileName];
        }
        if (fileName === 'index.html' && asset.type === 'asset' && typeof asset.source === 'string') {
          asset.source = asset.source.replace(/>\s+</g, '><').trim();
        }
      }
    },
    configureServer(server) {
      attachApiMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachApiMiddleware(server.middlewares);
    },
  };
}

// Prune Mermaid's rarely used diagrams and multi-megabyte layout engines (elkjs / cytoscape / swimlanes)
// while keeping the 10 core Markdown diagram types (flowchart, sequence, class, state, er, gantt, pie,
// gitGraph, mindmap, timeline). Layout requests automatically fall back to dagre per Mermaid's own tiny build.
const MERMAID_PRUNED_STUB = '\0readsoul-mermaid-pruned';
const MERMAID_ROUGH_STUB = '\0readsoul-mermaid-rough-stub';
const MERMAID_ICONIFY_STUB = '\0readsoul-mermaid-iconify-stub';
const MERMAID_PRUNED_RE =
  /(?:^|\/)(?:elk-|cose-bilkent-|swimlanes-|c4Diagram-|swimlanesDiagram-|infoDiagram-|quadrantDiagram-|xychartDiagram-|requirementDiagram-|journeyDiagram-|kanban-definition-|sankeyDiagram-|blockDiagram-|architectureDiagram-|ishikawaDiagram-|vennDiagram-|usecaseDiagram-|wardleyDiagram-|cynefinDiagram-|railroadDiagram-|ebnfDiagram-|abnfDiagram-|pegDiagram-|diagram-(?:2UJZ2QOL|UMYRVEAY|YEKJPTXX|PFPMY2P6|ZIFT7M5P|OVF4WLC6))[^/]*\.mjs$/;

function readsoulMermaidSlimPlugin(): Plugin {
  return {
    name: 'readsoul-mermaid-slim',
    resolveId(source, importer) {
      if (importer && importer.replace(/\\/g, '/').includes('/node_modules/mermaid/')) {
        if (MERMAID_PRUNED_RE.test(source.replace(/\\/g, '/'))) {
          return MERMAID_PRUNED_STUB;
        }
        if (source === 'roughjs' || source.startsWith('roughjs/')) {
          return MERMAID_ROUGH_STUB;
        }
        if (source === '@iconify/utils' || source.startsWith('@iconify/utils/')) {
          return MERMAID_ICONIFY_STUB;
        }
      }
      return null;
    },
    load(id) {
      if (id === MERMAID_PRUNED_STUB) {
        return `export const diagram={parser:{parse(){throw new Error('暂未内置该图表类型')}},db:{},renderer:{draw(){}}};export const render=()=>{throw new Error('Layout fallback')};`;
      }
      if (id === MERMAID_ROUGH_STUB) {
        const noop = '()=>({appendChild(){},setAttribute(){}})';
        return `export default{svg:()=>({line:${noop},rectangle:${noop},circle:${noop},ellipse:${noop},polygon:${noop},linearPath:${noop},path:${noop}})};`;
      }
      if (id === MERMAID_ICONIFY_STUB) {
        return `export const stringToIcon=()=>null;export const getIconData=()=>null;export const iconToSVG=()=>({attributes:{},body:''});export const iconToHTML=(b)=>b;export const replaceIDs=(b)=>b;`;
      }
      return null;
    },
    transform(code, id) {
      // Follow Mermaid's built-in tiny-build flag so layout algorithm lookup gracefully falls back to dagre.
      if (id.replace(/\\/g, '/').includes('/node_modules/mermaid/dist/chunks/mermaid.core/') && code.includes('elkLayoutLoaders()')) {
        return code.replace('...true ? [', '...false ? [');
      }
      return null;
    },
  };
}

const APP_VERSION = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version as string;

export default defineConfig({
  plugins: [readsoulMermaidSlimPlugin(), readsoulApiPlugin()],
  publicDir: 'web',
  resolve: {
    alias: {
      // Deduplicate Mermaid's nested katex@0.16 to the root katex package.
      katex: path.resolve(process.cwd(), 'node_modules/katex'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: (() => {
          let cache: Map<string, string | undefined> | null = null;
          return (
            id: string,
            {
              getModuleInfo,
              getModuleIds,
            }: {
              getModuleInfo: (
                id: string,
              ) => {
                isEntry: boolean;
                importedIds: readonly string[];
                dynamicallyImportedIds: readonly string[];
              } | null;
              getModuleIds: () => IterableIterator<string>;
            },
          ) => {
            if (!cache) {
              cache = new Map();
              const ids = [...getModuleIds()];
              const norm = (s: string) => s.replace(/\\/g, '/');
              const isNonJsAsset = (m: string) =>
                /\.(css|woff2?|png|svg|ico)(\?|$)/i.test(m) || m.includes('?html-proxy');

              const entryStatic = new Set<string>();
              const walkStatic = (startIds: string[], out: Set<string>, stopAt?: Set<string>) => {
                const stack = [...startIds];
                while (stack.length) {
                  const cur = stack.pop()!;
                  if (out.has(cur) || stopAt?.has(cur) || isNonJsAsset(cur)) continue;
                  out.add(cur);
                  const info = getModuleInfo(cur);
                  if (!info) continue;
                  for (const dep of info.importedIds) stack.push(dep);
                }
              };

              const entrySeeds = ids.filter((m) => {
                const info = getModuleInfo(m);
                const n = norm(m);
                return Boolean(info?.isEntry) || n.endsWith('/src/main.ts') || n.endsWith('/src/boot.ts');
              });
              walkStatic(entrySeeds, entryStatic);

              const appStatic = new Set<string>();
              const appSeeds = ids.filter((m) => norm(m).endsWith('/src/app.ts'));
              walkStatic(appSeeds, appStatic, entryStatic);

              for (const m of entryStatic) {
                const info = getModuleInfo(m);
                if (!info?.isEntry) cache.set(m, 'core');
              }
              for (const m of appStatic) {
                cache.set(m, 'app');
              }

              const markLazyTree = (roots: string[], chunkName: string) => {
                const visited = new Set<string>();
                const stack = [...roots];
                while (stack.length) {
                  const cur = stack.pop()!;
                  if (visited.has(cur) || isNonJsAsset(cur)) continue;
                  visited.add(cur);
                  if (!entryStatic.has(cur) && !appStatic.has(cur) && !cache!.has(cur)) {
                    cache!.set(cur, chunkName);
                  }
                  const info = getModuleInfo(cur);
                  if (!info) continue;
                  for (const dep of info.importedIds) stack.push(dep);
                  for (const dep of info.dynamicallyImportedIds) stack.push(dep);
                }
              };

              // Mark mermaid before delivery so mermaid stays in its own lazy chunk.
              markLazyTree(
                ids.filter((m) => norm(m).endsWith('/src/mermaid-runtime.ts')),
                'mermaid',
              );
              markLazyTree(
                ids.filter((m) => norm(m).endsWith('/src/docx-export.ts')),
                'docx-export',
              );
              markLazyTree(
                ids.filter((m) => norm(m).endsWith('/src/delivery.ts')),
                'delivery',
              );
              markLazyTree(
                ids.filter((m) => norm(m).endsWith('/src/paste.ts')),
                'paste-html',
              );
              const cmLangRoots = ids.filter((m) => norm(m).endsWith('/src/code-languages.ts'));
              const cmDynRoots: string[] = [];
              for (const m of cmLangRoots) {
                const info = getModuleInfo(m);
                if (info) cmDynRoots.push(...info.dynamicallyImportedIds);
              }
              markLazyTree(cmDynRoots, 'cm-langs');
            }
            return cache.get(id);
          };
        })(),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/.readsoul-data/**'],
    },
  },
});
