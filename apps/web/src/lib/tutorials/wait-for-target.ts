import { tourSelector } from '@sincvete/shared';
import { scrollTargetAwayFromGuidePanel } from '@/lib/tutorials/tutorial-guide-layout';

export async function waitForTarget(
  target: string | undefined,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ rect: DOMRect | null; missing: boolean }> {
  if (!target || typeof document === 'undefined') {
    return { rect: null, missing: Boolean(target) };
  }

  const timeoutMs = options.timeoutMs ?? 2500;
  const intervalMs = options.intervalMs ?? 100;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const el = document.querySelector(tourSelector(target));
    if (el) {
      const rect = scrollTargetAwayFromGuidePanel(el, { behavior: 'auto' });
      return { rect, missing: false };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { rect: null, missing: true };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => Element | null;
  };
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function') {
    return Boolean(el.closest('[contenteditable="true"]'));
  }
  return false;
}
