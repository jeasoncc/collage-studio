import { describe, expect, it } from 'vitest';
import { photoPostersForCount } from './photoPosters';
import { MAX_COLLAGE_PHOTOS } from './layouts';
import type { TemplatePreset } from '../types';

type Frame = NonNullable<TemplatePreset['photoFrames']>[number];
const EPSILON = 1e-10;

function overlapArea(a: Frame, b: Frame): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

// Check every region formed by the frame edges, not just a few sampled points.
// One covering frame per region catches both narrow cracks and double coverage.
function expectExactCoverage(frames: Frame[]) {
  const xs = [...new Set([0, 1, ...frames.flatMap(frame => [frame.x, frame.x + frame.width])])].sort((a, b) => a - b);
  const ys = [...new Set([0, 1, ...frames.flatMap(frame => [frame.y, frame.y + frame.height])])].sort((a, b) => a - b);
  for (let column = 0; column < xs.length - 1; column++) {
    if (xs[column + 1]! - xs[column]! < EPSILON) continue;
    const x = (xs[column]! + xs[column + 1]!) / 2;
    for (let row = 0; row < ys.length - 1; row++) {
      if (ys[row + 1]! - ys[row]! < EPSILON) continue;
      const y = (ys[row]! + ys[row + 1]!) / 2;
      expect(frames.filter(frame => x > frame.x && x < frame.x + frame.width && y > frame.y && y < frame.y + frame.height)).toHaveLength(1);
    }
  }
}

describe('current-photo contact posters', () => {
  it.each(Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => index + 1))('preserves all %i sources in distinct bounded frames covering the whole canvas', count => {
    const presets = photoPostersForCount(count);
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      const frames = preset.photoFrames!;
      // Source selection is positional: exactly one frame per source index.
      expect(frames).toHaveLength(count);
      expect(new Set(frames.map(frame => JSON.stringify([frame.x, frame.y, frame.width, frame.height]))).size).toBe(count);
      for (const frame of frames) {
        expect(frame.width).toBeGreaterThan(0);
        expect(frame.height).toBeGreaterThan(0);
        expect(frame.x).toBeGreaterThanOrEqual(-EPSILON);
        expect(frame.y).toBeGreaterThanOrEqual(-EPSILON);
        expect(frame.x + frame.width).toBeLessThanOrEqual(1 + EPSILON);
        expect(frame.y + frame.height).toBeLessThanOrEqual(1 + EPSILON);
        expect(frame.rotation ?? 0).toBe(0);
        expect(frame.borderWidth ?? 0).toBe(0);
        expect(frame.shape ?? 'rect').toBe('rect');
      }
      expect(frames.reduce((area, frame) => area + frame.width * frame.height, 0)).toBeCloseTo(1, 12);
      for (let index = 0; index < frames.length; index++) {
        for (const other of frames.slice(index + 1)) expect(overlapArea(frames[index]!, other)).toBeLessThan(EPSILON);
      }
      expectExactCoverage(frames);
    }
  });

  it('gives the first source the largest uninterrupted photo region at every supported count', () => {
    for (let count = 2; count <= MAX_COLLAGE_PHOTOS; count++) {
      for (const preset of photoPostersForCount(count)) {
        const [main, ...supports] = preset.photoFrames!;
        for (const frame of supports) expect(main!.width * main!.height).toBeGreaterThan(frame.width * frame.height);
      }
    }
  });

  it('chooses deterministic contact geometry for every supported collection size', () => {
    for (let count = 1; count <= MAX_COLLAGE_PHOTOS; count++) {
      expect(photoPostersForCount(count).map(preset => preset.photoFrames)).toEqual(photoPostersForCount(count).map(preset => preset.photoFrames));
    }
  });

  it('does not truncate or round unsupported photo counts', () => {
    for (const count of [-1, 0, .5, 4.5, 5.5, MAX_COLLAGE_PHOTOS + 1, MAX_COLLAGE_PHOTOS + 100, NaN, Infinity, -Infinity]) {
      expect(photoPostersForCount(count)).toEqual([]);
    }
  });
});
