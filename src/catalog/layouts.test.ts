import { describe, expect, it } from 'vitest';
import { layouts, layoutsForCount, MAX_COLLAGE_PHOTOS, recommendLayout } from './layouts';
import type { LayoutPreset } from '../types';
import { createPhotoFrame } from '../defaults';

const canvas = (width = 1000, height = 1000) => ({ width, height, padding: 0, gap: 0, photoFrame: createPhotoFrame() });

function cropLoss(layout: LayoutPreset, imageAspects: readonly number[], canvasAspect = 1): number {
  return layout.slots.reduce((sum, slot, index) => {
    const frameAspect = canvasAspect * slot.width / slot.height;
    const imageAspect = imageAspects[index]!;
    return sum + 1 - Math.min(imageAspect / frameAspect, frameAspect / imageAspect);
  }, 0) / imageAspects.length;
}

const landscape = { width: 1200, height: 600 };
const portrait = { width: 600, height: 1200 };

describe('curated photo compositions', () => {
  it('uses every photo exactly once in bounded, non-overlapping partitions', () => {
    for (let count = 1; count <= MAX_COLLAGE_PHOTOS; count++) {
      const options = layoutsForCount(count);
      expect(options.length).toBeGreaterThan(0);
      for (const layout of options) {
        expect(layout.slots).toHaveLength(count);
        let area = 0;
        layout.slots.forEach((slot, index) => {
          expect(slot.x).toBeGreaterThanOrEqual(0);
          expect(slot.y).toBeGreaterThanOrEqual(0);
          expect(slot.x + slot.width).toBeLessThanOrEqual(1 + 1e-12);
          expect(slot.y + slot.height).toBeLessThanOrEqual(1 + 1e-12);
          expect(slot.width).toBeGreaterThanOrEqual(.14);
          expect(slot.height).toBeGreaterThanOrEqual(.14);
          expect(slot.width / slot.height).toBeGreaterThanOrEqual(.25);
          expect(slot.width / slot.height).toBeLessThanOrEqual(4);
          area += slot.width * slot.height;
          for (const other of layout.slots.slice(index + 1)) {
            const overlapWidth = Math.min(slot.x + slot.width, other.x + other.width) - Math.max(slot.x, other.x);
            const overlapHeight = Math.min(slot.y + slot.height, other.y + other.height) - Math.max(slot.y, other.y);
            expect(Math.max(0, overlapWidth) * Math.max(0, overlapHeight)).toBeLessThan(1e-12);
          }
        });
        expect(area).toBeCloseTo(1, 12);
      }
    }
  });

  it('offers genuinely different photo arrangements, not duplicate named previews', () => {
    for (let count = 1; count <= MAX_COLLAGE_PHOTOS; count++) {
      const arrangements = layoutsForCount(count).map(layout => layout.slots
        .map(slot => [slot.x, slot.y, slot.width, slot.height].map(value => value.toFixed(6)).join(','))
        .join(';'));
      expect(new Set(arrangements).size).toBe(arrangements.length);
    }
    expect(new Set(layouts.map(layout => layout.id)).size).toBe(layouts.length);
  });


  it('offers readable walls, both contact orientations, narratives and editorial openings at every album count', () => {
    for (let count = 13; count <= MAX_COLLAGE_PHOTOS; count++) {
      const options = layoutsForCount(count);
      expect(options.length).toBeGreaterThanOrEqual(6);
      // Ignore slot ordering: renaming the same wall with another traversal is
      // not a new composition.
      const geometries = options.map(layout => layout.slots
        .map(slot => [slot.x, slot.y, slot.width, slot.height].map(value => value.toFixed(6)).join(','))
        .sort().join(';'));
      expect(new Set(geometries).size).toBe(options.length);
      expect(options.some(layout => layout.category === 'balanced')).toBe(true);
      expect(options.filter(layout => layout.category === 'contact').length).toBeGreaterThanOrEqual(2);
      expect(options.filter(layout => layout.category === 'feature').length).toBeGreaterThanOrEqual(2);
      expect(options.filter(layout => layout.category === 'editorial').length).toBeGreaterThanOrEqual(2);
      for (const layout of options) {
        expect(layout.count).toBe(count);
        expect(layout.slots.every(slot => slot.width * slot.height >= .03 - 1e-12)).toBe(true);
      }
    }
  });

});

describe('photo-aware layout recommendation', () => {
  it('has no recommendation without photos', () => {
    expect(recommendLayout([], canvas())).toBeUndefined();
  });

  it('retains useful landscape content rather than forcing a vertical composition', () => {
    const recommended = recommendLayout([landscape, landscape, landscape], canvas())!;
    const loss = cropLoss(recommended, [2, 2, 2]);
    const vertical = layoutsForCount(3).find(layout => layout.slots.some(slot => slot.height === 1 && slot.width === .5))!;
    expect(loss).toBeLessThan(cropLoss(vertical, [2, 2, 2]));
    expect(loss).toBeLessThan(.4);
  });

  it('retains useful portrait content instead of recommending thin horizontal strips', () => {
    for (const count of [3, 5, 8, 12]) {
      const recommended = recommendLayout(Array.from({ length: count }, () => portrait), canvas())!;
      expect(cropLoss(recommended, Array<number>(count).fill(.5))).toBeLessThan(.4);
      for (const slot of recommended.slots) {
        expect(slot.width * slot.height).toBeGreaterThan(.5 / count);
      }
    }
  });

  it('gives a leading landscape intentional prominence without hiding supporting portraits', () => {
    const recommended = recommendLayout([landscape, portrait, portrait], canvas())!;
    const first = recommended.slots[0]!;
    const aspect = first.width / first.height;
    expect(Math.min(aspect / 2, 2 / aspect)).toBeGreaterThan(.8);
    for (const supporting of recommended.slots.slice(1)) {
      expect(first.width * first.height).toBeGreaterThan(supporting.width * supporting.height);
      expect(supporting.width * supporting.height).toBeGreaterThan(.18);
    }
  });

  it('changes composition with the canvas aspect to avoid cropping', () => {
    const photos = [landscape, landscape];
    const square = recommendLayout(photos, canvas())!;
    const wide = recommendLayout(photos, canvas(2000, 500))!;
    expect(square.id).not.toBe(wide.id);
    expect(cropLoss(square, [2, 2], 1)).toBeCloseTo(0);
    expect(cropLoss(wide, [2, 2], 4)).toBeCloseTo(0);
    expect(cropLoss(square, [2, 2], 4)).toBeGreaterThan(0);
  });

  it('scores photos in their supplied order rather than moving them to matching frames', () => {
    const squarePhoto = { width: 600, height: 600 };
    const trailingLandscape = recommendLayout([squarePhoto, squarePhoto, landscape], canvas())!;
    const leadingLandscape = recommendLayout([landscape, squarePhoto, squarePhoto], canvas())!;
    expect(cropLoss(trailingLandscape, [1, 1, 2])).toBeCloseTo(0);
    expect(leadingLandscape.id).not.toBe(trailingLandscape.id);
    expect(cropLoss(leadingLandscape, [2, 1, 1])).toBeLessThan(cropLoss(trailingLandscape, [2, 1, 1]));
  });

  it('recommends the entire supplied album and refuses unsupported counts', () => {
    for (const count of [13, 16, MAX_COLLAGE_PHOTOS]) {
      const photos = Array.from({ length: count }, (_, index) => index % 2 ? portrait : landscape);
      expect(recommendLayout(photos, canvas())?.slots).toHaveLength(count);
    }
    expect(recommendLayout(Array.from({ length: MAX_COLLAGE_PHOTOS + 1 }, () => portrait), canvas())).toBeUndefined();
    expect(layoutsForCount(MAX_COLLAGE_PHOTOS + 1)).toEqual([]);
  });
});
