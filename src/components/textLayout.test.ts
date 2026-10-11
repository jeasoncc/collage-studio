import { describe, expect, it } from 'vitest';
import { textFrameHeight } from './textLayout';

describe('visible text frame height', () => {
  it('keeps the final line inside a fractionally padded caption', () => {
    const fontSize = 42.26039999999999;
    const lineHeight = fontSize * 1.45;
    const padding = fontSize * .28;
    const naturalHeight = lineHeight * 2 + padding * 2;
    // This exact height lost the second line when Konva subtracted both paddings.
    const height = textFrameHeight(naturalHeight, naturalHeight);
    expect(height - padding * 2).toBeGreaterThan(lineHeight * 2);
    expect(height - naturalHeight).toBeLessThan(2);
  });

  it('does not grow an already measured or resized frame on repeated positioning', () => {
    const naturalHeight = 146.22098399999996;
    const measured = textFrameHeight(0, naturalHeight);
    let current = measured;
    for (let index = 0; index < 10; index++) current = textFrameHeight(current, naturalHeight);
    expect(current).toBe(measured);
    const resized = 200.5;
    expect(textFrameHeight(resized, naturalHeight)).toBe(resized);
  });
});
