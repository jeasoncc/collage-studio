import { describe, expect, it } from 'vitest';
import { createPhotoFrame } from '../defaults';
import { photoFrameGeometry } from './photoFrameGeometry';
import type { PhotoFrameSpec } from '../types';

const instant: PhotoFrameSpec = { kind: 'instant', color: '#ffffff', insetRatio: .065, footerRatio: .26, shadowRatio: .034 };

describe('physical photo frames', () => {
  it('fits a landscape instant print in a short cell without flattening its image', () => {
    const frame = photoFrameGeometry(1000, 250, instant, 1200, 800);
    expect(frame.width / frame.height).toBeCloseTo(1.5);
    expect(frame.outerHeight).toBeCloseTo(250);
    expect(frame.outerWidth).toBeLessThan(1000);
    expect(frame.outerX * 2 + frame.outerWidth).toBeCloseTo(1000);
    expect(frame.outerY).toBeCloseTo(0);
    expect(frame.footer / frame.outerWidth).toBeCloseTo(.26);
    expect(frame.inset / frame.outerWidth).toBeCloseTo(.065);
    expect(frame.height).toBeGreaterThan(frame.footer);
  });
  it('fits a portrait print by width while centering its complete lower margin', () => {
    const frame = photoFrameGeometry(300, 1000, instant, 800, 1200);
    expect(frame.width / frame.height).toBeCloseTo(2 / 3);
    expect(frame.outerWidth).toBeCloseTo(300);
    expect(frame.outerX).toBeCloseTo(0);
    expect(frame.outerY * 2 + frame.outerHeight).toBeCloseTo(1000);
    expect(frame.y + frame.height + frame.inset + frame.footer).toBeCloseTo(frame.outerY + frame.outerHeight);
  });
  it('keeps full-bleed cover geometry even when source proportions differ', () => {
    const frame = photoFrameGeometry(1000, 250, createPhotoFrame(), 800, 1200);
    expect(frame).toMatchObject({ x: 0, y: 0, width: 1000, height: 250, outerX: 0, outerY: 0, outerWidth: 1000, outerHeight: 250, inset: 0, footer: 0 });
  });
  it('keeps unknown-source previews bounded and drawable in very short cells', () => {
    const frame = photoFrameGeometry(300, 16, instant);
    expect(frame.width).toBeGreaterThanOrEqual(1);
    expect(frame.height).toBeGreaterThanOrEqual(1);
    expect(frame.y + frame.height + frame.inset + frame.footer).toBeLessThanOrEqual(16.000001);
  });
});
