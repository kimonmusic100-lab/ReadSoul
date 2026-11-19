import type { DocumentFilterResponse, SearchHit, SearchItem, Summary } from './types';
import { icon } from './icons';

export interface HomeSplashOptions {
  reducedMotion: boolean;
  onSearch: (query: string) => Promise<DocumentFilterResponse>;
  onOpenItem: (item: SearchItem, hit?: SearchHit) => Promise<void>;
  onOpenRecent: (docId: string) => Promise<void>;
  onCreateWithTitle: (title: string) => Promise<void>;
  onNewBlank: () => Promise<void>;
  onOpenLocal: () => void;
  onDismiss: () => void;
}

export interface HomeSplashController {
  openHome: (replay?: boolean) => void;
  closeHome: () => void;
  updateRecent: (items: Summary[]) => void;
  isOpen: () => boolean;
}

interface Candidate {
  kind: 'doc' | 'create';
  title: string;
  sub?: string;
  tag: string;
  item?: SearchItem;
  hit?: SearchHit;
}

const SPLASH_TO_HOME_DELAY_MS = 3200;
const SEARCH_DEBOUNCE_MS = 120;

export function initHomeSplash(options: HomeSplashOptions): HomeSplashController {
  const overlay = document.querySelector<HTMLElement>('#rs-home-overlay');
  const splashLayer = document.querySelector<HTMLElement>('#rs-splash-layer');
  const searchZone = document.querySelector<HTMLElement>('#rs-home-search-zone');
  const input = document.querySelector<HTMLInputElement>('#rs-home-search-input');
  const resultsEl = document.querySelector<HTMLElement>('#rs-home-results');
  const newBtn = document.querySelector<HTMLButtonElement>('#rs-home-new');
  const recentBtn = document.querySelector<HTMLButtonElement>('#rs-home-recent');
  const openBtn = document.querySelector<HTMLButtonElement>('#rs-home-open');
  const recentTray = document.querySelector<HTMLElement>('#rs-home-recent-tray');
  const recentTrack = document.querySelector<HTMLElement>('#rs-home-recent-track');

  if (!overlay || !splashLayer || !searchZone || !input || !resultsEl) {
    return {
      openHome: () => {},
      closeHome: () => {},
      updateRecent: () => {},
      isOpen: () => false,
    };
  }

  let open = true;
  let splashTimer: ReturnType<typeof setTimeout> | undefined;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchEpoch = 0;
  let candidates: Candidate[] = [];
  let activeIndex = 0;
  let recentDocs: Summary[] = [];
  let recentOpen = false;

  const clearSplashTimer = () => {
    if (splashTimer !== undefined) {
      clearTimeout(splashTimer);
      splashTimer = undefined;
    }
  };

  const clearRevealTimer = () => {
    if (revealTimer !== undefined) {
      clearTimeout(revealTimer);
      revealTimer = undefined;
    }
  };

  const formatRecentTime = (timestamp: number) => {
    try {
      return new Date(timestamp).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const setRecentOpen = (next: boolean) => {
    recentOpen = next;
    recentTray?.classList.toggle('open', recentOpen);
    recentBtn?.classList.toggle('is-active', recentOpen);
    recentBtn?.setAttribute('aria-expanded', String(recentOpen));
    if (recentOpen) {
      candidates = [];
      activeIndex = 0;
      renderResults();
      if (recentTrack) recentTrack.scrollLeft = 0;
    }
  };

  const renderRecentCards = () => {
    if (!recentTrack) return;
    recentTrack.replaceChildren();
    if (!recentDocs.length) {
      const empty = document.createElement('div');
      empty.className = 'rs-home-recent-empty';
      empty.textContent = '暂无最近打开的文稿，可点击「新建文稿」或「打开文稿」开始写作';
      recentTrack.append(empty);
      return;
    }
    for (const item of recentDocs) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'rs-home-recent-card';

      const head = document.createElement('div');
      head.className = 'rs-home-recent-card-head';

      const ic = document.createElement('span');
      ic.className = 'rs-home-recent-card-icon';
      ic.setAttribute('aria-hidden', 'true');
      ic.append(icon('file-text'));

      const title = document.createElement('span');
      title.className = 'rs-home-recent-card-title';
      title.textContent = item.title || '未命名文稿';
      head.append(ic, title);

      const excerpt = document.createElement('p');
      excerpt.className = 'rs-home-recent-card-excerpt';
      excerpt.textContent = item.excerpt || '空白文稿，等待开始书写…';

      const foot = document.createElement('div');
      foot.className = 'rs-home-recent-card-foot';

      const time = document.createElement('span');
      time.textContent = formatRecentTime(item.updated);

      const kind = document.createElement('span');
      kind.className = 'rs-home-recent-card-kind';
      kind.textContent = item.path ? '本地' : '草稿';

      foot.append(time, kind);
      card.append(head, excerpt, foot);
      card.addEventListener('click', () => {
        closeHome();
        void options.onOpenRecent(item.id);
      });
      recentTrack.append(card);
    }
  };

  const renderResults = () => {
    resultsEl.replaceChildren();
    if (!candidates.length) {
      resultsEl.classList.remove('open');
      return;
    }
    candidates.forEach((cand, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rs-home-result-item' + (idx === activeIndex ? ' active' : '');

      const main = document.createElement('span');
      main.className = 'rs-home-result-main';

      const title = document.createElement('span');
      title.className = 'rs-home-result-title';
      title.textContent = cand.title;
      main.append(title);

      if (cand.sub) {
        const sub = document.createElement('span');
        sub.className = 'rs-home-result-sub';
        sub.textContent = cand.sub;
        main.append(sub);
      }

      const tag = document.createElement('span');
      tag.className = 'rs-home-result-tag';
      tag.textContent = cand.tag;

      btn.append(main, tag);
      btn.addEventListener('mouseenter', () => {
        activeIndex = idx;
        updateActiveClass();
      });
      btn.addEventListener('click', () => void activateCandidate(cand));
      resultsEl.append(btn);
    });
    resultsEl.classList.add('open');
  };

  const updateActiveClass = () => {
    const items = Array.from(resultsEl.querySelectorAll<HTMLElement>('.rs-home-result-item'));
    items.forEach((el, idx) => el.classList.toggle('active', idx === activeIndex));
  };

  const resetSearch = () => {
    searchEpoch++;
    clearTimeout(searchTimer);
    input.value = '';
    candidates = [];
    activeIndex = 0;
    renderResults();
  };

  const syncChromeImmediate = () => {
    clearRevealTimer();
    document.documentElement.classList.remove('rs-chrome-hidden', 'rs-chrome-reveal');
  };

  const closeHome = () => {
    if (!open) return;
    open = false;
    clearSplashTimer();
    clearTimeout(searchTimer);
    setRecentOpen(false);
    syncChromeImmediate();
    overlay.classList.add('is-hidden');
    overlay.setAttribute('aria-hidden', 'true');
    options.onDismiss();
  };

  const enterSettledHome = (immediate: boolean) => {
    clearSplashTimer();
    clearRevealTimer();
    searchZone.classList.toggle('immediate', immediate);
    if (immediate) {
      splashLayer.classList.remove('is-playing');
      splashLayer.classList.add('is-settled', 'to-home');
      document.documentElement.classList.remove('rs-chrome-hidden', 'rs-chrome-reveal');
    } else {
      splashLayer.classList.remove('is-settled');
      splashLayer.classList.add('to-home');
      document.documentElement.classList.remove('rs-chrome-hidden');
      revealTimer = setTimeout(() => {
        document.documentElement.classList.remove('rs-chrome-reveal');
        revealTimer = undefined;
      }, 3100);
    }
    searchZone.classList.add('visible');
    if (open) {
      requestAnimationFrame(() => input.focus());
    }
  };

  const openHome = (replay = false) => {
    open = true;
    resetSearch();
    setRecentOpen(false);
    overlay.classList.remove('is-hidden');
    overlay.setAttribute('aria-hidden', 'false');

    if (replay && !options.reducedMotion) {
      clearSplashTimer();
      clearRevealTimer();
      document.documentElement.classList.add('rs-chrome-reveal', 'rs-chrome-hidden');
      searchZone.classList.remove('visible', 'immediate');
      splashLayer.classList.remove('is-playing', 'is-settled', 'to-home');
      void splashLayer.offsetWidth;
      splashLayer.classList.add('is-playing');
      splashTimer = setTimeout(() => {
        if (open) enterSettledHome(false);
      }, SPLASH_TO_HOME_DELAY_MS);
    } else {
      syncChromeImmediate();
      enterSettledHome(true);
    }
  };

  const activateCandidate = async (cand: Candidate) => {
    if (cand.kind === 'create') {
      const title = cand.title.replace(/^按 Enter 创建「(.*)\.md」$/, '$1');
      closeHome();
      await options.onCreateWithTitle(title);
      return;
    }
    if (cand.item) {
      closeHome();
      await options.onOpenItem(cand.item, cand.hit);
    }
  };

  const runSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      candidates = [];
      activeIndex = 0;
      renderResults();
      return;
    }
    const stamp = ++searchEpoch;
    try {
      const res = await options.onSearch(trimmed);
      if (stamp !== searchEpoch || !open) return;
      const items = (res.items || []).slice(0, 6);
      candidates = items.map((entry) => {
        const item = entry.document;
        const firstHit = item.hits?.[0];
        const hitText = firstHit ? `${firstHit.before}${firstHit.text}${firstHit.after}`.trim() : '';
        return {
          kind: 'doc',
          title: item.title || '未命名文稿',
          sub: hitText || (entry.tags?.length ? entry.tags.map((t) => `#${t}`).join(' ') : entry.excerpt || undefined),
          tag: item.path ? '本地文件' : '草稿',
          item,
          hit: firstHit,
        };
      });
      if (!candidates.length) {
        candidates = [
          {
            kind: 'create',
            title: `按 Enter 创建「${trimmed}.md」`,
            tag: '新建',
          },
        ];
      }
      activeIndex = 0;
      renderResults();
    } catch {
      if (stamp !== searchEpoch) return;
      candidates = [
        {
          kind: 'create',
          title: `按 Enter 创建「${trimmed}.md」`,
          tag: '新建',
        },
      ];
      activeIndex = 0;
      renderResults();
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const val = input.value;
    if (!val.trim()) {
      searchEpoch++;
      candidates = [];
      activeIndex = 0;
      renderResults();
      return;
    }
    if (recentOpen) setRecentOpen(false);
    searchTimer = setTimeout(() => void runSearch(val), SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (input.value.trim()) {
        resetSearch();
      } else {
        closeHome();
      }
      return;
    }
    if (e.key === 'ArrowDown' && candidates.length) {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % candidates.length;
      updateActiveClass();
      return;
    }
    if (e.key === 'ArrowUp' && candidates.length) {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + candidates.length) % candidates.length;
      updateActiveClass();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = candidates[activeIndex];
      if (chosen) {
        void activateCandidate(chosen);
      } else if (input.value.trim()) {
        const title = input.value.trim();
        closeHome();
        void options.onCreateWithTitle(title);
      }
    }
  });

  newBtn?.addEventListener('click', () => {
    closeHome();
    void options.onNewBlank();
  });
  recentBtn?.addEventListener('click', () => {
    setRecentOpen(!recentOpen);
  });
  openBtn?.addEventListener('click', () => {
    closeHome();
    options.onOpenLocal();
  });
  recentTrack?.addEventListener(
    'wheel',
    (e) => {
      if (recentTrack.scrollWidth <= recentTrack.clientWidth) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta !== 0) {
        e.preventDefault();
        recentTrack.scrollLeft += delta;
      }
    },
    { passive: false },
  );

  // 播放初次启动动画，3.2s 后丝滑接入首页搜索区，并同步渐显顶栏与左侧栏
  openHome(true);

  return {
    openHome,
    closeHome,
    updateRecent: (items: Summary[]) => {
      recentDocs = Array.isArray(items) ? items : [];
      renderRecentCards();
    },
    isOpen: () => open,
  };
}
