export interface SmoothScrollController {
 /** 立即取消当前惯性动画并同步到容器实际滚动位置。 */
 cancel: () => void;
 /** 卸载事件监听并停止动画帧。 */
 dispose: () => void;
}

const WHEEL_GAIN = 1.15;
const WHEEL_DAMPING = 10.5;
const TOUCHPAD_DAMPING = 22;
const STOP_EPSILON = 0.35;
const EXTERNAL_DELTA_THRESHOLD = 1.5;

const clamp = (value: number, min: number, max: number): number =>
 Math.min(Math.max(value, min), max);

function normalizeWheelDelta(event: WheelEvent, container: HTMLElement): number {
 if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 40;
 if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * container.clientHeight * 0.85;
 return event.deltaY;
}

function hasScrollableAncestor(target: EventTarget | null, root: HTMLElement, dy: number): boolean {
 let node = target instanceof Element ? target : null;
 while (node && node !== root) {
  const overflowY = getComputedStyle(node).overflowY;
  if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight + 1) {
   if (dy < 0 && node.scrollTop > 0) return true;
   if (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
  }
  node = node.parentElement;
 }
 return false;
}

/**
 * 为阅读容器附加帧率无关的高刷平滑惯性滚轮控制器。
 * 按真实 `requestAnimationFrame` 时间步长做指数阻尼逼近，在 60Hz/120Hz/144Hz+ 下均可呈现顺滑的轻微惯性尾韵，
 * 并在外部滚动（拖滚动条、大纲/搜索跳转、分栏编辑器同步）介入时自动让权，避免位置回弹冲突。
 */
export function createSmoothScroll(
 container: HTMLElement,
 isReducedMotion: () => boolean = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
): SmoothScrollController {
 let rafId = 0;
 let currentY = 0;
 let targetY = 0;
 let lastWrittenY = 0;
 let lastFrameAt = 0;
 let lastWheelAt = 0;
 let activeDamping = WHEEL_DAMPING;

 const stop = () => {
  if (rafId) {
   cancelAnimationFrame(rafId);
   rafId = 0;
  }
  lastFrameAt = 0;
 };

 const step = (now: number) => {
  rafId = 0;
  if (Math.abs(container.scrollTop - lastWrittenY) > EXTERNAL_DELTA_THRESHOLD) {
   stop();
   return;
  }

  const dt = lastFrameAt ? clamp((now - lastFrameAt) / 1000, 0.001, 0.05) : 1 / 120;
  lastFrameAt = now;

  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  targetY = clamp(targetY, 0, maxScroll);
  const diff = targetY - currentY;

  if (Math.abs(diff) <= STOP_EPSILON) {
   container.scrollTop = targetY;
   lastWrittenY = container.scrollTop;
   stop();
   return;
  }

  const alpha = 1 - Math.exp(-activeDamping * dt);
  currentY += diff * alpha;
  container.scrollTop = currentY;
  lastWrittenY = container.scrollTop;

  if ((diff > 0 && lastWrittenY >= maxScroll - 0.5 && currentY >= maxScroll - 0.5)
   || (diff < 0 && lastWrittenY <= 0.5 && currentY <= 0.5)) {
   stop();
   return;
  }

  rafId = requestAnimationFrame(step);
 };

 const onWheel = (event: WheelEvent) => {
  if (isReducedMotion() || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
  if (event.deltaY === 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  if (maxScroll <= 1) return;

  const rawDelta = normalizeWheelDelta(event, container);
  if (hasScrollableAncestor(event.target, container, rawDelta)) return;

  if (!rafId && ((rawDelta < 0 && container.scrollTop <= 0) || (rawDelta > 0 && container.scrollTop >= maxScroll))) {
   return;
  }

  event.preventDefault();

  const now = performance.now();
  const wheelInterval = now - lastWheelAt;
  lastWheelAt = now;

  // 高频微小像素流来自高精度触控板，采用紧凑跟手阻尼避免打滑；离散滚轮使用轻微惯性尾韵。
  const isTouchpadStream = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
   && Math.abs(event.deltaY) < 40
   && wheelInterval > 0
   && wheelInterval < 45;
  const gain = isTouchpadStream ? 1 : WHEEL_GAIN;
  activeDamping = isTouchpadStream ? TOUCHPAD_DAMPING : WHEEL_DAMPING;

  if (!rafId) {
   const actual = container.scrollTop;
   currentY = actual;
   targetY = actual;
   lastWrittenY = actual;
   lastFrameAt = now;
  } else if (Math.abs(container.scrollTop - lastWrittenY) > EXTERNAL_DELTA_THRESHOLD) {
   const actual = container.scrollTop;
   currentY = actual;
   targetY = actual;
   lastWrittenY = actual;
  }

  const remaining = targetY - currentY;
  if (remaining !== 0 && Math.sign(rawDelta) !== Math.sign(remaining)) {
   // 反向滚动瞬间清零残余动量，确保立即调头跟手。
   targetY = currentY;
  }

  targetY = clamp(targetY + rawDelta * gain, 0, maxScroll);
  if (!rafId) rafId = requestAnimationFrame(step);
 };

 const onManualInterrupt = () => {
  if (rafId) stop();
 };

 container.addEventListener('wheel', onWheel, { passive: false });
 container.addEventListener('pointerdown', onManualInterrupt, { passive: true });
 container.addEventListener('keydown', onManualInterrupt, { passive: true });

 return {
  cancel: stop,
  dispose() {
   stop();
   container.removeEventListener('wheel', onWheel);
   container.removeEventListener('pointerdown', onManualInterrupt);
   container.removeEventListener('keydown', onManualInterrupt);
  },
 };
}
