import { GENERATIVE_ICONS } from './generative-icons-data';

type StaticNode = [string, Record<string, string>];

const RAIL_STATIC_ICONS: Record<string, StaticNode[]> = {
  user: [
    ['circle', { cx: '12', cy: '8.5', r: '3.5' }],
    ['path', { d: 'M5.5 19.5c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5' }],
  ],
  home: [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    ['path', { d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
  ],
  history: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 7v5l4 2' }],
  ],
  library: [
    ['path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' }],
    ['path', { d: 'M8 7h8' }],
    ['path', { d: 'M8 11h6' }],
  ],
  cloud: [
    ['path', { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z' }],
  ],
  'hard-drive': [
    ['rect', { x: '3', y: '13', width: '18', height: '7', rx: '2' }],
    ['path', { d: 'M5.5 13L7.6 5.8A2 2 0 0 1 9.5 4.5h5a2 2 0 0 1 1.9 1.3L18.5 13' }],
    ['line', { x1: '16.5', y1: '16.5', x2: '16.51', y2: '16.5' }],
    ['line', { x1: '13', y1: '16.5', x2: '13.01', y2: '16.5' }],
  ],
  refresh: [
    ['path', { d: 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16' }],
    ['path', { d: 'M16 16h5v5' }],
  ],
  'chevrons-down': [
    ['polyline', { points: '7 7 12 12 17 7' }],
    ['polyline', { points: '7 13 12 18 17 13' }],
  ],
  'external-link': [
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
    ['polyline', { points: '15 3 21 3 21 9' }],
    ['line', { x1: '10', y1: '14', x2: '21', y2: '3' }],
  ],
  settings: [
    ['line', { x1: '4.5', y1: '7', x2: '19.5', y2: '7' }],
    ['line', { x1: '4.5', y1: '12', x2: '19.5', y2: '12' }],
    ['line', { x1: '4.5', y1: '17', x2: '19.5', y2: '17' }],
  ],
  folder: [
    ['path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
  ],
  'folder-open': [
    ['path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H8a2 2 0 0 0-1.9 1.37L4 17V7z' }],
    ['path', { d: 'M4 17l2.1-6.3A1.5 1.5 0 0 1 7.5 10H21l-2.1 6.3a2 2 0 0 1-1.9 1.4H4z' }],
  ],
  'folder-plus': [
    ['path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ['line', { x1: '12', y1: '10.5', x2: '12', y2: '15.5' }],
    ['line', { x1: '9.5', y1: '13', x2: '14.5', y2: '13' }],
  ],
  'file-plus': [
    ['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }],
    ['polyline', { points: '14 3 14 8 19 8' }],
    ['line', { x1: '12', y1: '11.5', x2: '12', y2: '16.5' }],
    ['line', { x1: '9.5', y1: '14', x2: '14.5', y2: '14' }],
  ],
};

const svgTemplate = typeof document !== 'undefined' ? document.createElement('template') : null;

function createStaticRailIcon(nodes: StaticNode[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of nodes) {
    const el = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    svg.append(el);
  }
  return svg;
}

export function icon(name: string): SVGSVGElement {
  const staticNodes = RAIL_STATIC_ICONS[name];
  if (staticNodes) return createStaticRailIcon(staticNodes);

  const markup = GENERATIVE_ICONS[name] ?? GENERATIVE_ICONS.more;
  if (svgTemplate) {
    svgTemplate.innerHTML = markup;
    const svg = svgTemplate.content.firstElementChild as SVGSVGElement;
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('gi-icon');
    return svg;
  }
  const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  fallback.setAttribute('viewBox', '0 0 32 32');
  fallback.setAttribute('aria-hidden', 'true');
  return fallback;
}

export function applyIcons(): void {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.replaceChildren(icon(el.dataset.icon!));
  });
}
