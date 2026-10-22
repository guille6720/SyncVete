import { describe, expect, it } from 'vitest';
import { isEditableKeyboardTarget } from './wait-for-target';

describe('isEditableKeyboardTarget', () => {
  it('returns false for null / non-elements', () => {
    expect(isEditableKeyboardTarget(null)).toBe(false);
    expect(isEditableKeyboardTarget('x' as unknown as EventTarget)).toBe(false);
  });

  it('detects editable-like objects without DOM globals', () => {
    expect(isEditableKeyboardTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isEditableKeyboardTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(
      true
    );
  });
});
