import { describe, expect, it } from 'vitest';
import {
  GUIDE_PLAYBACK_BAR_HEIGHT,
  getGuidePanelLayoutMode,
  getGuidePanelReservePx,
  targetOverlapsGuidePanel,
} from '@/lib/tutorials/tutorial-guide-layout';

describe('tutorial guide layout', () => {
  it('always uses the compact bottom playback bar', () => {
    expect(getGuidePanelLayoutMode(1280)).toBe('bottom');
    expect(getGuidePanelLayoutMode(390)).toBe('bottom');
  });

  it('reserves bottom space so the spotlight target stays visible', () => {
    expect(GUIDE_PLAYBACK_BAR_HEIGHT).toBeGreaterThanOrEqual(150);
    const desktop = getGuidePanelReservePx({ width: 1280, height: 800 });
    expect(desktop.reserveX).toBe(0);
    expect(desktop.reserveY).toBe(GUIDE_PLAYBACK_BAR_HEIGHT);

    const mobile = getGuidePanelReservePx({ width: 390, height: 800 });
    expect(mobile.reserveY).toBe(GUIDE_PLAYBACK_BAR_HEIGHT);
    expect(mobile.reserveX).toBe(0);
  });

  it('detects overlap with the bottom playback bar', () => {
    const viewport = { width: 1280, height: 800 };
    const safe = { top: 100, left: 40, right: 200, bottom: 160, width: 160, height: 60 };
    const covered = { top: 720, left: 40, right: 240, bottom: 780, width: 200, height: 60 };
    expect(targetOverlapsGuidePanel(safe, viewport)).toBe(false);
    expect(targetOverlapsGuidePanel(covered, viewport)).toBe(true);
  });
});
