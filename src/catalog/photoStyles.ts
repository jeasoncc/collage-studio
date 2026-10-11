import { createFilter } from '../defaults';
import type { FilterState } from '../types';

export const palette = ['#29342f', '#ffffff', '#698870', '#d17d76', '#e8c56d', '#7e9eb3', '#aa8abc', '#f2ddd2'];
export const filterPresets: { label: string; filter: FilterState }[] = [
  { label: '原图', filter: createFilter() },
  { label: '明亮', filter: { ...createFilter(), brightness: .12, contrast: 8, saturation: .12 } },
  { label: '柔和', filter: { ...createFilter(), brightness: .06, contrast: -16, saturation: -.12 } },
  { label: '鲜艳', filter: { ...createFilter(), contrast: 18, saturation: .35 } },
  { label: '黑白', filter: { ...createFilter(), grayscale: true, contrast: 12 } },
  { label: '复古', filter: { ...createFilter(), sepia: true, contrast: -5, saturation: -.15 } },
];

export function filterCss(filter: FilterState) {
  return `brightness(${1 + filter.brightness}) contrast(${((filter.contrast + 100) / 100) ** 2}) saturate(${2 ** filter.saturation}) blur(${filter.blur}px) grayscale(${Number(filter.grayscale)}) sepia(${Number(filter.sepia)})`;
}
