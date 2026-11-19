import fs from 'fs';
import path from 'path';
import { dotLottieToSvg, lottieToSvg } from '../node_modules/@lottiefiles/generative-icons-runtime/dist/svg.mjs';
import { readZip } from '../node_modules/@lottiefiles/generative-icons-runtime/dist/weight.mjs';

const CATALOG_PATH = 'node_modules/@lottiefiles/generative-icons/dist/catalog.json';
const ASSETS_DIR = 'node_modules/@lottiefiles/generative-icons/dist/assets';
const OUT_PATH = 'src/generative-icons-data.ts';

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

/** Direct generative-icons conversions via dotLottieToSvg / lottieToSvg */
const DIRECT_MAP = {
  home: ['home', 'auto'],
  history: ['version-history', 'forward'],
  settings: ['settings', 'auto'],
  files: ['folder', 'auto'],
  'file-text': ['document', 'forward'],
  user: ['user', 'auto'],
  'view-edit': ['edit', 'forward'],
  'view-split': ['split-view', 'auto'],
  'view-read': ['reading-mode', 'forward'],
  find: ['search', 'auto'],
  export: ['export-file', 'auto'],
  close: ['close', 'auto'],
  new: ['new-file', 'auto'],
  sidebar: ['sidebar-toggle', 'reverse'],
  appearance: ['appearance', 'forward'],
  more: ['more-options', 'auto'],
  'chevron-left': ['chevron-left', 'auto'],
  'chevron-right': ['chevron-right', 'auto'],
  'chevron-down': ['chevron-down', 'auto'],
  'chevron-up': ['chevron-up', 'auto'],
  check: ['check', 'forward'],
  clock: ['clock', 'forward'],
  bold: ['bold', 'auto'],
  italic: ['italic', 'forward'],
  underline: ['underline', 'forward'],
  strike: ['strikethrough', 'forward'],
  highlight: ['text-highlight', 'forward'],
  inlineCode: ['embed', 'auto'],
  clearFormatting: ['clear-formatting', 'forward'],
  quote: ['quoted-message', 'auto'],
  bullet: ['bulleted-list', 'forward'],
  ordered: ['numbered-list', 'forward'],
  task: ['checkbox', 'forward'],
  link: ['link', 'auto'],
  image: ['image', 'forward'],
  table: ['pivot-table', 'forward'],
  code: ['code-generate', 'forward'],
  math: ['sum', 'auto'],
  mermaid: ['sitemap', 'auto'],
  maximize: ['arrows-expand', 'auto'],
  'image-alt': ['closed-captions', 'forward'],
  trash: ['trash', 'auto'],
  'grip-vertical': ['drag-handle', 'forward'],
  footnote: ['sticky-note', 'auto'],
  note: ['info', 'forward'],
  tip: ['lightbulb', 'forward'],
  important: ['priority-alert', 'auto'],
  warning: ['warning', 'auto'],
  caution: ['error', 'auto'],
  restore: ['fullscreen', 'reverse'],
};

function normalizeSvg(svg) {
  return svg
    .replace(/\swidth="[^"]*"\s+height="[^"]*"/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadAnimations(id) {
  const bytes = fs.readFileSync(path.join(ASSETS_DIR, `${id}.lottie`));
  const entries = await readZip(bytes);
  const decoder = new TextDecoder();
  const anims = {};
  for (const e of entries) {
    if (/^a\/[^/]+\.json$/.test(e.name)) {
      anims[e.name.slice(2, -5)] = JSON.parse(decoder.decode(e.data));
    }
  }
  return { bytes, anims };
}

async function generateDirect(id, mode) {
  const icon = catalog.icons.find((i) => i.id === id);
  if (!icon) throw new Error(`Missing catalog icon: ${id}`);
  const { bytes, anims } = await loadAnimations(id);
  const light = icon.motions.find((x) => x.motionId === 'light') || icon.motions[0];
  let svg;
  if (mode === 'auto' && !icon.stateful) {
    svg = await dotLottieToSvg(icon, bytes, {
      trigger: 'js',
      weight: 2,
      color: 'currentColor',
      id: 'GI_UID',
    });
  } else {
    const m = mode === 'reverse' ? light.reverse : light;
    if (!m) throw new Error(`Missing motion (${mode}) for ${id}`);
    const wEnd = m.continuous
      ? m.frames
      : Math.max(Math.min(m.frames - 1, Math.ceil(m.active * m.fps)), m.rest);
    svg = lottieToSvg(anims[m.name], {
      trigger: 'js',
      window: [0, wEnd],
      rest: m.rest,
      weight: 2,
      color: 'currentColor',
      id: 'GI_UID',
    });
  }
  return normalizeSvg(svg);
}

/**
 * Strip SMIL animations from a generated SVG to get its exact resting geometry,
 * so stateful directional icons (undo/redo, indent/outdent, align) never briefly
 * morph into the opposite icon on hover.
 */
function stripAnimations(svg) {
  return svg
    .replace(/<defs>.*?<\/defs>/g, '')
    .replace(/<animate[^>]*\/>/g, '')
    .replace(/<animateTransform[^>]*\/>/g, '')
    .replace(/<set[^>]*\/>/g, '')
    .replace(/<rect width="0" height="0"><\/rect>/g, '')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .trim();
}

const wrapGiSvg = (inner, dur = '0.42s') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" stroke-linecap="round" stroke-linejoin="round">${inner}<rect width="0" height="0"><set id="GI_UID_m" attributeName="x" to="0" begin="indefinite" dur="${dur}"/></rect></svg>`;

async function generateAll() {
  const out = {};

  for (const [key, [id, mode]] of Object.entries(DIRECT_MAP)) {
    out[key] = await generateDirect(id, mode);
  }

  // Stateful directional icons: preserve exact generative-icons resting geometry,
  // paired with same-direction SMIL spring motion (no opposite-state flash).
  const undoBody = stripAnimations(await generateDirect('undo-redo', 'reverse'));
  out.undo = wrapGiSvg(
    `<g>${undoBody}<animateTransform attributeName="transform" type="rotate" values="0 16 16;-20 16 16;5 16 16;0 16 16" keyTimes="0;0.34;0.74;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.42s" begin="GI_UID_m.begin"/></g>`
  );

  const redoBody = stripAnimations(await generateDirect('undo-redo', 'forward'));
  out.redo = wrapGiSvg(
    `<g>${redoBody}<animateTransform attributeName="transform" type="rotate" values="0 16 16;20 16 16;-5 16 16;0 16 16" keyTimes="0;0.34;0.74;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.42s" begin="GI_UID_m.begin"/></g>`
  );

  const indentBody = stripAnimations(await generateDirect('indent-outdent', 'reverse'));
  out.indent = wrapGiSvg(
    `<g>${indentBody}<animateTransform attributeName="transform" type="translate" values="0 0;2.2 0;-0.4 0;0 0" keyTimes="0;0.36;0.76;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.4s" begin="GI_UID_m.begin"/></g>`,
    '0.4s'
  );

  const outdentBody = stripAnimations(await generateDirect('indent-outdent', 'forward'));
  out.outdent = wrapGiSvg(
    `<g>${outdentBody}<animateTransform attributeName="transform" type="translate" values="0 0;-2.2 0;0.4 0;0 0" keyTimes="0;0.36;0.76;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.4s" begin="GI_UID_m.begin"/></g>`,
    '0.4s'
  );

  // Align Left / Center / Right using exact generative-icons text-alignment geometry
  out['align-left'] = wrapGiSvg(
    `<path d="M6 8L26 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 18L26 18" fill="none" stroke="currentColor" stroke-width="2"/><g><path d="M6 13L18 13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 23L18 23" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;-1.8 0;0.4 0;0 0" keyTimes="0;0.35;0.75;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.38s" begin="GI_UID_m.begin"/></g>`,
    '0.38s'
  );

  out['align-center'] = wrapGiSvg(
    `<path d="M6 8L26 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 18L26 18" fill="none" stroke="currentColor" stroke-width="2"/><g><path d="M10 13L22 13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 23L22 23" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0.3;0 0" keyTimes="0;0.35;0.75;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.38s" begin="GI_UID_m.begin"/></g>`,
    '0.38s'
  );

  out['align-right'] = wrapGiSvg(
    `<path d="M6 8L26 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 18L26 18" fill="none" stroke="currentColor" stroke-width="2"/><g><path d="M14 13L26 13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 23L26 23" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;1.8 0;-0.4 0;0 0" keyTimes="0;0.35;0.75;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.38s" begin="GI_UID_m.begin"/></g>`,
    '0.38s'
  );

  // Unified 32x32 stroke-2 geometric companions for UI symbols without direct catalog entries
  out.plus = wrapGiSvg(
    `<path d="M9 16L23 16" fill="none" stroke="currentColor" stroke-width="2"><animate attributeName="d" values="M9 16L23 16;M10.8 16L21.2 16;M8.5 16L23.5 16;M9 16L23 16" keyTimes="0;0.34;0.72;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.36s" begin="GI_UID_m.begin"/></path><path d="M16 9L16 23" fill="none" stroke="currentColor" stroke-width="2"><animate attributeName="d" values="M16 9L16 23;M16 10.8L16 21.2;M16 8.5L16 23.5;M16 9L16 23" keyTimes="0;0.34;0.72;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.36s" begin="GI_UID_m.begin"/></path>`,
    '0.36s'
  );

  out.minus = wrapGiSvg(
    `<path d="M9 16L23 16" fill="none" stroke="currentColor" stroke-width="2"><animate attributeName="d" values="M9 16L23 16;M11 16L21 16;M8.5 16L23.5 16;M9 16L23 16" keyTimes="0;0.35;0.72;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.36s" begin="GI_UID_m.begin"/></path>`,
    '0.36s'
  );

  out.square = wrapGiSvg(
    `<rect x="7.5" y="7.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"><animate attributeName="x" values="7.5;6.7;7.7;7.5" keyTimes="0;0.38;0.75;1" dur="0.36s" begin="GI_UID_m.begin"/><animate attributeName="y" values="7.5;6.7;7.7;7.5" keyTimes="0;0.38;0.75;1" dur="0.36s" begin="GI_UID_m.begin"/><animate attributeName="width" values="17;18.6;16.6;17" keyTimes="0;0.38;0.75;1" dur="0.36s" begin="GI_UID_m.begin"/><animate attributeName="height" values="17;18.6;16.6;17" keyTimes="0;0.38;0.75;1" dur="0.36s" begin="GI_UID_m.begin"/></rect>`,
    '0.36s'
  );

  // Override restore to classic Windows dual-frame geometry with unified stroke-2 & spring nudge
  out.restore = wrapGiSvg(
    `<g><path d="M11 10V8.2C11 7.095 11.895 6.2 13 6.2H23.8C24.905 6.2 25.8 7.095 25.8 8.2V19C25.8 20.105 24.905 21 23.8 21H22" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;1.2 -1.2;0 0" keyTimes="0;0.45;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1" dur="0.38s" begin="GI_UID_m.begin"/></g><g><rect x="6.2" y="11" width="14.8" height="14.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;-0.8 0.8;0 0" keyTimes="0;0.45;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1" dur="0.38s" begin="GI_UID_m.begin"/></g>`,
    '0.38s'
  );

  // Table of contents outline (distinct from menu & bullet list)
  out.outline = wrapGiSvg(
    `<g><path d="M6 9H19" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 16H19" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 23H19" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;1.6 0;0 0" keyTimes="0;0.42;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1" dur="0.38s" begin="GI_UID_m.begin"/></g><circle cx="24.5" cy="9" r="1.4" fill="currentColor"/><circle cx="24.5" cy="16" r="1.4" fill="currentColor"/><circle cx="24.5" cy="23" r="1.4" fill="currentColor"/>`,
    '0.38s'
  );

  out.superscript = wrapGiSvg(
    `<path d="M6 24L16.5 13.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 24L6 13.5" fill="none" stroke="currentColor" stroke-width="2"/><g><path d="M26 14H20.8C20.8 12.1 21.5 11.4 23 10.7C24.4 10 25.5 9.3 25.5 7.7C25.5 6.4 24.4 5.5 23.1 5.5C21.9 5.5 21 6.2 20.6 7.3" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.6;0 0.3;0 0" keyTimes="0;0.38;0.74;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.4s" begin="GI_UID_m.begin"/></g>`,
    '0.4s'
  );

  out.subscript = wrapGiSvg(
    `<path d="M6 8L16.5 18.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 8L6 18.5" fill="none" stroke="currentColor" stroke-width="2"/><g><path d="M26 26H20.8C20.8 24.1 21.5 23.4 23 22.7C24.4 22 25.5 21.3 25.5 19.7C25.5 18.4 24.4 17.5 23.1 17.5C21.9 17.5 21 18.2 20.6 19.3" fill="none" stroke="currentColor" stroke-width="2"/><animateTransform attributeName="transform" type="translate" values="0 0;0 1.6;0 -0.3;0 0" keyTimes="0;0.38;0.74;1" calcMode="spline" keySplines="0.33 1 0.67 1;0.33 0 0.67 1;0.33 0 0.67 1" dur="0.4s" begin="GI_UID_m.begin"/></g>`,
    '0.4s'
  );

  const header = `// Auto-generated by scripts/generate-icons.mjs from @lottiefiles/generative-icons (MIT).\n// Uses pure offline SMIL animated SVGs with currentColor theming and GI_UID instance isolation.\nexport const GENERATIVE_ICONS: Record<string, string> = `;
  const content = `${header}${JSON.stringify(out, null, 2)};\n`;
  fs.writeFileSync(OUT_PATH, content, 'utf8');
  console.log(`Generated ${Object.keys(out).length} icons -> ${OUT_PATH} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
}

generateAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
