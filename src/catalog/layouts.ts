import type { EditorDocument, LayoutPreset, NormalizedRect } from '../types';
import { slotRect } from '../defaults';
import { photoFrameGeometry } from '../components/photoFrameGeometry';

export const MAX_COLLAGE_PHOTOS = 20;

const rect = (x: number, y: number, width: number, height: number): NormalizedRect => ({ x, y, width, height });
type Category = NonNullable<LayoutPreset['category']>;

// Bands partition their own region. Unequal band heights are deliberate editorial
// decisions, rather than a new grid generated for every possible row count.
function bands(counts: readonly number[], heights: readonly number[] = counts.map(() => 1 / counts.length), x = 0, y = 0, width = 1, height = 1): NormalizedRect[] {
  const slots: NormalizedRect[] = [];
  let top = y;
  counts.forEach((count, row) => {
    const bandHeight = height * heights[row]!;
    for (let column = 0; column < count; column++) {
      slots.push(rect(x + width * column / count, top, width / count, bandHeight));
    }
    top += bandHeight;
  });
  return slots;
}
function transpose(slots: readonly NormalizedRect[]): NormalizedRect[] {
  return slots.map(({ x, y, width, height }) => rect(y, x, height, width));
}
function preset(id: string, name: string, category: Category, description: string, slots: NormalizedRect[]): LayoutPreset {
  return { id, name, category, description, count: slots.length, slots };
}
function sideStory(width: number, counts: readonly number[], heights?: readonly number[]): NormalizedRect[] {
  return [rect(0, 0, width, 1), ...bands(counts, heights, width, 0, 1 - width, 1)];
}

export const layouts: LayoutPreset[] = [preset('grid-1', '单幅画廊', 'balanced', '让一张照片独立成篇，留白由当前风格决定。', [rect(0, 0, 1, 1)])];

const small: Record<number, { grid: NormalizedRect[]; stack: NormalizedRect[]; hero: NormalizedRect[]; mosaic?: NormalizedRect[]; editorial?: NormalizedRect[] }> = {
  2: {
    grid: bands([2]),
    stack: bands([1, 1]),
    hero: sideStory(.62, [1]),
  },
  3: {
    grid: sideStory(.5, [1, 1]),
    stack: transpose(sideStory(.5, [1, 1])),
    hero: sideStory(.56, [1, 1]),
    mosaic: [...bands([1, 1], undefined, 0, 0, .5, 1), rect(.5, 0, .5, 1)],
    editorial: bands([2, 1]),
  },
  4: {
    grid: bands([2, 2]),
    stack: bands([2, 2], [.38, .62]),
    hero: sideStory(.6, [1, 1, 1]),
    mosaic: [...bands([1, 1], [.62, .38], 0, 0, .52, 1), ...bands([1, 1], [.38, .62], .52, 0, .48, 1)],
    editorial: bands([1, 3], [.42, .58]),
  },
  5: {
    grid: bands([2, 3], [.55, .45]),
    stack: transpose(bands([2, 3], [.55, .45])),
    hero: sideStory(.58, [2, 2]),
    mosaic: [...bands([1, 1], [.62, .38], 0, 0, .44, 1), ...bands([1, 1, 1], [.28, .44, .28], .44, 0, .56, 1)],
    editorial: bands([2, 3], [.4, .6]),
  },
  6: {
    grid: bands([3, 3]),
    stack: bands([2, 2, 2]),
    hero: sideStory(.5, [1, 2, 2], [.4, .3, .3]),
    mosaic: [...bands([1, 1], undefined, 0, 0, .4, 1), ...bands([2, 2], undefined, .4, 0, .6, 1)],
    editorial: bands([2, 2, 2], [.4, .3, .3]),
  },
};

for (let count = 2; count <= 6; count++) {
  const composition = small[count]!;
  layouts.push(
    preset(`grid-${count}`, count === 2 ? '并排双幅' : count === 3 ? '双页叙事' : '均衡画廊', 'balanced', count === 2 ? '两幅等大的竖向画面，适合人物与并置对比。' : '清晰的阅读顺序与稳定的视觉重量，每一张都值得停留。', composition.grid),
    preset(`stack-${count}`, count === 2 ? '上下双幅' : count === 3 ? '开篇横幅' : count === 6 ? '六幅接触印相' : '纵向节奏', count === 6 ? 'contact' : 'balanced', count === 2 ? '两张横向照片上下呼应，适合风景与空间。' : count === 3 ? '第一张铺开场景，下方两张补充细节。' : '完整的行列节奏，适合按顺序整理一组照片。', composition.stack),
    preset(`hero-${count}`, '主角在左', 'feature', '第一张占据主视觉，右侧照片串起细节与回忆。', composition.hero),
    preset(`hero-top-${count}`, '封面与故事', 'feature', '第一张作为横向开篇，其余照片在下方形成完整故事。', transpose(composition.hero)),
  );
  if (composition.mosaic && composition.editorial) {
    layouts.push(
      preset(`mosaic-${count}`, '错页画册', 'editorial', '两列错开的分割线，在完整画面之间制造轻盈的节奏。', composition.mosaic),
      preset(`asymmetric-${count}`, count === 3 ? '收尾横幅' : '杂志分镜', 'editorial', count === 3 ? '先读两张细节，再以横向场景收尾；照片顺序不变。' : '宽幅与细节分组呼应，适合旅行、日常与专题摄影。', composition.editorial),
    );
  }
}
// A three-frame sequence is useful for uniformly wide or uniformly tall sources.
// Do not extend these strips to higher counts: the photos would become slivers.
layouts.push(
  preset('contact-wide-3', '横幅三联', 'contact', '三张横向照片等大排列，适合连续的风景与空间。', bands([1, 1, 1])),
  preset('contact-tall-3', '竖幅三联', 'contact', '三张竖向照片等大并排，适合人物与建筑系列。', bands([3])),
);
// Each count has a chosen contact-sheet rhythm and a separate supporting grid.
// Even at twelve photos the smallest supporting side is at least .14 of the sheet.
const sheets: Record<number, { grid: number[]; stack: number[]; support: number[]; spread: number[] }> = {
  7: { grid: [3, 4], stack: [2, 3, 2], support: [2, 2, 2], spread: [2, 3] },
  8: { grid: [4, 4], stack: [3, 2, 3], support: [2, 3, 2], spread: [3, 3] },
  9: { grid: [3, 3, 3], stack: [2, 2, 3, 2], support: [2, 2, 2, 2], spread: [3, 4] },
  10: { grid: [3, 4, 3], stack: [2, 3, 3, 2], support: [3, 3, 3], spread: [4, 4] },
  11: { grid: [4, 3, 4], stack: [3, 3, 2, 3], support: [3, 4, 3], spread: [3, 3, 3] },
  12: { grid: [4, 4, 4], stack: [3, 3, 3, 3], support: [3, 3, 3, 2], spread: [3, 4, 3] },
};
for (let count = 7; count <= 12; count++) {
  const sheet = sheets[count]!;
  const hero = sideStory(.42, sheet.support);
  const upperCount = count <= 9 ? 3 : 4;
  const lowerCount = count - upperCount;
  const lowerRows = lowerCount <= 6 ? [Math.ceil(lowerCount / 2), Math.floor(lowerCount / 2)] : [4, lowerCount - 4];
  layouts.push(
    preset(`grid-${count}`, '摄影接触页', 'contact', '等高整齐的接触印相，适合一次看完这一组照片。', bands(sheet.grid)),
    preset(`stack-${count}`, '纵向档案', 'contact', '更多行、更宽的单幅照片，适合横向摄影与连续记录。', bands(sheet.stack)),
    preset(`hero-${count}`, '主角与细节', 'feature', '左侧保留一幅完整主视觉，右侧以紧凑而可读的小组展开。', hero),
    preset(`hero-top-${count}`, '大景开篇', 'feature', '横向主图先交代场景，下方细节组成有序的照片档案。', transpose(hero)),
    preset(`mosaic-${count}`, '双页专题', 'editorial', '上方两幅重点照片并置，下方以均匀分组承接故事。', [
      ...bands([2], undefined, 0, 0, 1, .46),
      ...bands(sheet.spread, undefined, 0, .46, 1, .54),
    ]),
    preset(`asymmetric-${count}`, '章节分镜', 'editorial', '上方一行建立主题，下方两行展开细节，阅读顺序清晰。', [
      ...bands([upperCount], undefined, 0, 0, 1, .4),
      ...bands(lowerRows, undefined, 0, .4, 1, .6),
    ]),
  );
}

// Album pages keep supporting frames substantial: no more than six columns,
// and at least .17 of the page height, even when the opening is emphasized.
const albums: Record<number, { wall: number[]; contact: number[]; support: number[]; paired: number[]; chapters: number[] }> = {
  13: { wall: [3, 4, 3, 3], contact: [3, 2, 3, 2, 3], support: [3, 3, 3, 3], paired: [3, 3, 3, 2], chapters: [3, 2, 3, 2, 3] },
  14: { wall: [3, 4, 4, 3], contact: [3, 3, 2, 3, 3], support: [3, 4, 3, 3], paired: [3, 3, 3, 3], chapters: [3, 3, 3, 2, 3] },
  15: { wall: [3, 4, 5, 3], contact: [3, 3, 3, 3, 3], support: [3, 4, 4, 3], paired: [3, 4, 3, 3], chapters: [3, 3, 3, 3, 3] },
  16: { wall: [3, 5, 5, 3], contact: [3, 3, 4, 3, 3], support: [4, 4, 4, 3], paired: [3, 4, 4, 3], chapters: [3, 3, 3, 3, 4] },
  17: { wall: [4, 4, 5, 4], contact: [3, 4, 3, 4, 3], support: [4, 4, 4, 4], paired: [4, 4, 4, 3], chapters: [3, 4, 3, 3, 4] },
  18: { wall: [4, 5, 5, 4], contact: [4, 3, 4, 3, 4], support: [4, 5, 4, 4], paired: [4, 4, 4, 4], chapters: [3, 4, 3, 4, 4] },
  19: { wall: [4, 5, 6, 4], contact: [4, 4, 3, 4, 4], support: [4, 5, 5, 4], paired: [4, 5, 4, 4], chapters: [3, 4, 3, 4, 5] },
  20: { wall: [4, 5, 6, 5], contact: [4, 4, 4, 4, 4], support: [5, 5, 5, 4], paired: [4, 5, 5, 4], chapters: [3, 5, 3, 4, 5] },
};
for (let count = 13; count <= MAX_COLLAGE_PHOTOS; count++) {
  const album = albums[count]!;
  const landscapeContact = bands(album.contact);
  const narrative = [rect(0, 0, 1, .28), ...bands(album.support, undefined, 0, .28, 1, .72)];
  layouts.push(
    preset(`grid-${count}`, '均衡摄影墙', 'balanced', '四行错缝照片墙，场景与细节等重，每张照片都有完整位置。', bands(album.wall)),
    preset(`stack-${count}`, '横幅接触印相', 'contact', '五行宽幅接触页，按照片顺序阅读整组影像。', landscapeContact),
    preset(`contact-tall-${count}`, '竖幅接触印相', 'contact', '五列竖向接触页，适合人物、建筑与竖幅系列。', transpose(landscapeContact)),
    preset(`hero-top-${count}`, '封面叙事', 'feature', '首张宽幅照片交代场景，下方四行保留全部故事细节。', narrative),
    preset(`hero-${count}`, '侧页主角', 'feature', '左侧完整主视觉，右侧四列展开人物与旅途细节。', transpose(narrative)),
    preset(`mosaic-${count}`, '双幅开篇', 'editorial', '两幅重点照片并置开篇，四行接触页有序承接。', [
      ...bands([2], undefined, 0, 0, 1, .32),
      ...bands(album.paired, undefined, 0, .32, 1, .68),
    ]),
    preset(`asymmetric-${count}`, '章节节奏', 'editorial', '两组三幅大画面与三组细节交替，形成有起伏的章节阅读。', bands(album.chapters, [.24, .17, .24, .175, .175])),
  );
}


export function layoutsForCount(count: number): LayoutPreset[] {
  return layouts.filter(layout => layout.count === count);
}

export function recommendLayout(
  assets: readonly { width: number; height: number }[],
  document: Pick<EditorDocument, 'width' | 'height' | 'padding' | 'gap' | 'photoFrame'>,
): LayoutPreset | undefined {
  const count = assets.length;
  if (count === 0 || count > MAX_COLLAGE_PHOTOS) return undefined;

  const imageAspects = Array.from({ length: count }, (_, index) => assets[index]!.width / assets[index]!.height);
  const innerArea = (document.width - document.padding * 2) * (document.height - document.padding * 2);
  let best: LayoutPreset | undefined;
  let bestLoss = Infinity;

  for (const layout of layouts) {
    if (layout.count !== count) continue;
    let loss = 0;
    for (let index = 0; index < count; index++) {
      const slot = layout.slots[index]!;
      const area = slot.width * slot.height;
      const outer = slotRect(document, slot);
      const frame = photoFrameGeometry(outer.width, outer.height, document.photoFrame, assets[index]!.width, assets[index]!.height);
      const frameAspect = frame.width / frame.height;
      const imageAspect = imageAspects[index]!;
      const retained = Math.min(imageAspect / frameAspect, frameAspect / imageAspect);
      // A cover photo matters more, but supporting photos still carry most of
      // their own vote. Never improve the score by hiding them in tiny strips.
      const prominence = .65 / count + .35 * area;
      const smallFrame = Math.max(0, .55 - frame.outerWidth * frame.outerHeight / innerArea * count);
      const unused = 1 - frame.outerWidth * frame.outerHeight / (outer.width * outer.height);
      const strip = Math.max(0, Math.abs(Math.log(frameAspect)) - Math.log(4));
      loss += prominence * (1 - retained) + (.2 * smallFrame + .08 * strip + .3 * unused) / count;
    }
    // Stable tie-breaking keeps balanced/contact layouts ahead of hero layouts.
    if (loss < bestLoss - 1e-12) {
      best = layout;
      bestLoss = loss;
    }
  }
  return best;
}
