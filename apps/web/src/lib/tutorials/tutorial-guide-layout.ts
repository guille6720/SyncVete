/**
 * Layout helpers for continuous tutorial playback.
 * Compact bottom bar only — no side “Guía Tutoriales” rail.
 */

export const GUIDE_PLAYBACK_BAR_HEIGHT = 168;
/** @deprecated Use GUIDE_PLAYBACK_BAR_HEIGHT — side panel removed. */
export const GUIDE_PANEL_DESKTOP_WIDTH = 0;
/** @deprecated Bottom sheet height replaced by GUIDE_PLAYBACK_BAR_HEIGHT. */
export const GUIDE_PANEL_MOBILE_MAX_HEIGHT = 0.14;
export const GUIDE_PANEL_BREAKPOINT_PX = 768;

export type GuidePanelLayoutMode = 'bottom';

export function getGuidePanelLayoutMode(
  _width = typeof window !== 'undefined' ? window.innerWidth : GUIDE_PANEL_BREAKPOINT_PX
): GuidePanelLayoutMode {
  return 'bottom';
}

export function getGuidePanelReservePx(_options?: {
  width?: number;
  height?: number;
  mode?: GuidePanelLayoutMode;
}): { mode: GuidePanelLayoutMode; reserveX: number; reserveY: number } {
  return {
    mode: 'bottom',
    reserveX: 0,
    reserveY: GUIDE_PLAYBACK_BAR_HEIGHT,
  };
}

/**
 * True when the target rect intersects the reserved playback-bar zone.
 */
export function targetOverlapsGuidePanel(
  rect: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>,
  viewport?: { width: number; height: number }
): boolean {
  const height =
    viewport?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const { reserveY } = getGuidePanelReservePx();
  const pad = 12;
  const panelTop = height - reserveY;
  return rect.bottom > panelTop + pad && rect.top < height;
}

/**
 * Scroll a target into the safe viewport zone above the playback bar.
 */
export function scrollTargetAwayFromGuidePanel(
  el: Element,
  options?: { behavior?: ScrollBehavior }
): DOMRect {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = options?.behavior ?? (reduceMotion ? 'auto' : 'smooth');
  const { reserveY } = getGuidePanelReservePx();

  try {
    (el as HTMLElement).style.scrollMarginRight = '0px';
    (el as HTMLElement).style.scrollMarginBottom = `${reserveY + 24}px`;
  } catch {
    // ignore non-HTML elements
  }

  el.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior,
  });

  const nudge = () => {
    const rect = el.getBoundingClientRect();
    if (!targetOverlapsGuidePanel(rect)) return;
    const overflow = rect.bottom - (window.innerHeight - reserveY - 16);
    if (overflow > 0) {
      window.scrollBy({ left: 0, top: overflow + 8, behavior });
    }
  };

  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      nudge();
      requestAnimationFrame(nudge);
    });
  }

  return el.getBoundingClientRect();
}
