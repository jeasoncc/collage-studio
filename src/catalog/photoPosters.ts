import type { SceneElement, ShapeElement, TemplatePreset, TextElement } from '../types';
import { chineseFonts } from './photoText';
import { MAX_COLLAGE_PHOTOS } from './layouts';

type Frame = NonNullable<TemplatePreset['photoFrames']>[number];
type PosterStyle = 'cinema' | 'fashion' | 'support' | 'calligraphy' | 'memory';
const WIDTH = 1080;
const HEIGHT = 1350;
const elementDefaults = { rotation: 0, opacity: 1, locked: false, visible: true, animation: 'none' as const, shadow: 0 };

// Partition a complete rectangle, not a set of inset cards. Adjacent cells use
// the same boundaries, and balanced rows leave no empty slots at any count.
function contactGrid(count: number, region: Frame): Frame[] {
  const rows = Math.max(1, Math.min(count, Math.round(Math.sqrt(count * region.height * HEIGHT / (region.width * WIDTH)))));
  const frames: Frame[] = [];
  for (let row = 0; row < rows; row++) {
    const columns = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const top = region.y + region.height * row / rows;
    const bottom = region.y + region.height * (row + 1) / rows;
    for (let column = 0; column < columns; column++) {
      const left = region.x + region.width * column / columns;
      const right = region.x + region.width * (column + 1) / columns;
      frames.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return frames;
}

// The array order is the source order: frame zero is always the dominant photo.
// Every branch tiles the full canvas exactly once, including small collections.
function contactFrames(count: number, style: PosterStyle): Frame[] {
  if (count === 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
  const remaining = count - 1;
  if (style === 'cinema') {
    return [{ x: 0, y: 0, width: 1, height: .72 }, ...contactGrid(remaining, { x: 0, y: .72, width: 1, height: .28 })];
  }
  if (style === 'memory') {
    return [{ x: 0, y: .34, width: 1, height: .66 }, ...contactGrid(remaining, { x: 0, y: 0, width: 1, height: .34 })];
  }
  if (style === 'calligraphy') {
    return [{ x: .26, y: 0, width: .74, height: 1 }, ...contactGrid(remaining, { x: 0, y: 0, width: .26, height: 1 })];
  }
  if (style === 'fashion') {
    if (count === 2) return [{ x: 0, y: 0, width: .70, height: 1 }, { x: .70, y: 0, width: .30, height: 1 }];
    const sideCount = Math.max(1, Math.min(remaining - 1, Math.round(remaining * .45)));
    return [
      { x: 0, y: 0, width: .68, height: .72 },
      ...contactGrid(sideCount, { x: .68, y: 0, width: .32, height: .72 }),
      ...contactGrid(remaining - sideCount, { x: 0, y: .72, width: 1, height: .28 }),
    ];
  }
  if (count === 2) return [{ x: 0, y: 0, width: .76, height: 1 }, { x: .76, y: 0, width: .24, height: 1 }];
  if (count === 3) return [
    { x: .22, y: 0, width: .56, height: 1 },
    { x: 0, y: 0, width: .22, height: 1 },
    { x: .78, y: 0, width: .22, height: 1 },
  ];
  const bottomCount = Math.max(1, Math.min(remaining - 2, Math.round(remaining * .49)));
  const leftCount = Math.ceil((remaining - bottomCount) / 2);
  const rightCount = remaining - bottomCount - leftCount;
  return [
    { x: .22, y: 0, width: .56, height: .70 },
    ...contactGrid(leftCount, { x: 0, y: 0, width: .22, height: .70 }),
    ...contactGrid(rightCount, { x: .78, y: 0, width: .22, height: .70 }),
    ...contactGrid(bottomCount, { x: 0, y: .70, width: 1, height: .30 }),
  ];
}

function poster(count: number, style: PosterStyle): TemplatePreset {
  const id = `poster-${style}-${count}`;
  const text = (key: string, value: string, x: number, y: number, width: number, fontSize: number, color: string, extra: Partial<TextElement> = {}): TextElement => ({
    ...elementDefaults, id: `${id}-${key}`, type: 'text', x: x * WIDTH, y: y * HEIGHT, width: width * WIDTH,
    height: fontSize * (extra.lineHeight ?? 1.2) * value.split('\n').length + fontSize * .2,
    text: value, fontFamily: chineseFonts.sans, fontSize, fontStyle: 'normal', color, align: 'left', lineHeight: 1.2,
    stroke: '', strokeWidth: 0, backgroundColor: 'transparent', curve: 0, ...extra,
  });
  const shape = (key: string, x: number, y: number, width: number, height: number, fill: string, extra: Partial<ShapeElement> = {}): ShapeElement => ({
    ...elementDefaults, id: `${id}-${key}`, type: 'shape', x: x * WIDTH, y: y * HEIGHT, width: width * WIDTH, height: height * HEIGHT,
    shape: 'rect', fill, stroke: '', strokeWidth: 0, ...extra,
  });
  let name: string;
  let category: string;
  let description: string;
  let color: string;
  let elements: SceneElement[];

  if (style === 'cinema') {
    name = '人生这一幕'; category = '电影'; color = '#17211f';
    description = '宽幅主照与底部连帧，奶白宋体、暖金片名线，把日常剪成电影封面。';
    elements = [
      shape('title-wash', 0, .515, 1, .205, '#14221ddd'),
      text('eyebrow', '一部关于我们的电影', .06, .038, .88, 32, '#fff7e9', { shadow: 6 }),
      shape('title-rule', .06, .537, .15, .003, '#d4b87b'),
      text('title', '人生这一幕', .06, .555, .88, 106, '#fff7e9', { fontFamily: chineseFonts.serif }),
      text('deck', '有你在场，每一帧都值得。', .065, .659, .65, 28, '#f1dfbb', { fontFamily: chineseFonts.kai }),
      text('edition', `${count} 帧 · 私人放映`, .65, .666, .29, 23, '#f1dfbb', { align: 'right' }),
    ];
  } else if (style === 'fashion') {
    name = '今天，正是封面'; category = '杂志'; color = '#f8f4ed';
    description = '主照与侧栏、底栏无缝相接，醒目宋体刊头配朱红细线，像一本属于你的时尚杂志。';
    elements = [
      shape('masthead-wash', 0, 0, 1, .175, '#14201c99'),
      text('title', '日常有光', .045, .028, .91, 135, '#fffaf0', { fontFamily: chineseFonts.serif }),
      shape('masthead-rule', .047, .148, .905, .003, '#c65843'),
      text('issue', `人物特刊 · ${count} 个生活切片`, .05, .158, .85, 28, '#fffaf0', { shadow: 5 }),
      shape('cover-note-wash', .035, .53, .59, .15, '#fffaf0d4'),
      text('cover-note', '今天，正是封面', .06, .547, .55, 46, '#253b30', { fontFamily: chineseFonts.display }),
      text('deck', '不必等到特别的一天', .065, .602, .52, 30, '#3e4f44', { fontFamily: chineseFonts.fangsong }),
      text('caption', '把真实的自己，留在这一页。', .065, .642, .52, 24, '#a44737'),
    ];
  } else if (style === 'support') {
    name = '全场，为你喝彩'; category = '应援'; color = '#302421';
    description = '主角站在照片环绕的中心，得意黑大标题与朱红应援标记，热烈但不喧闹。';
    elements = [
      shape('headline-wash', .15, .505, .70, .178, '#20231fd9'),
      shape('headline-rule', .19, .526, .11, .005, '#dd6951'),
      text('title', '为你喝彩', .18, .547, .64, 105, '#fff8eb', { fontFamily: chineseFonts.display, align: 'center' }),
      text('deck', '每一次闪耀，我们都在', .19, .645, .62, 29, '#ffe1c8', { fontFamily: chineseFonts.kai, align: 'center' }),
      shape('support-tag', .035, .025, .29, .047, '#bb4739', { opacity: .92 }),
      text('support-label', '热爱，永远在场', .045, .035, .27, 26, '#fff8eb', { align: 'center' }),
      text('edition', `${count} 个瞬间 · 同一份热爱`, .05, .95, .90, 31, '#fff8eb', { backgroundColor: '#20231fd9', align: 'center' }),
    ];
  } else if (style === 'calligraphy') {
    name = '山海有约'; category = '书意'; color = '#26362d';
    description = '侧边连片与右侧主照，纵向毛笔题字、仿宋小记和一枚朱印，留出主角的呼吸。';
    elements = [
      shape('ink-wash', .28, .035, .17, .49, '#182c24ba'),
      text('title', '山\n海\n有\n约', .285, .052, .16, 121, '#fff5df', { fontFamily: chineseFonts.brush, align: 'center', lineHeight: 1.17 }),
      shape('seal', .326, .545, .085, .068, '#a94135', { opacity: .9 }),
      text('seal-text', '相逢', .326, .561, .085, 32, '#fff1dc', { fontFamily: chineseFonts.serif, align: 'center' }),
      shape('caption-wash', .28, .858, .68, .102, '#182c24ba'),
      shape('caption-rule', .31, .884, .05, .002, '#e8d4af'),
      text('deck', '一程山水，一生相记', .38, .873, .55, 40, '#fff5df', { fontFamily: chineseFonts.fangsong }),
      text('edition', `此刻珍藏 · ${count} 帧`, .38, .919, .55, 26, '#e8d4af', { fontFamily: chineseFonts.kai }),
    ];
  } else {
    name = '岁月，值得珍藏'; category = '纪念'; color = '#f5efe2';
    description = '上方连帧接住回忆，下方大幅主照记录相聚，温润文楷与半透明纪念签轻轻落在照片上。';
    elements = [
      shape('memory-wash', .045, .793, .91, .164, '#fff8e6e0'),
      shape('memory-rule', .078, .822, .075, .003, '#9c6a40'),
      text('eyebrow', '共同的回忆', .18, .809, .70, 29, '#735b43', { fontFamily: chineseFonts.fangsong }),
      text('title', '岁月，值得珍藏', .075, .848, .85, 76, '#33473b', { fontFamily: chineseFonts.kai }),
      text('deck', `同行的人，是最好的风景 · ${count} 帧珍藏`, .08, .918, .84, 28, '#735b43', { fontFamily: chineseFonts.fangsong }),
    ];
  }
  return {
    id, name, category, description: `${count} 张照片 · ${description}照片铺满画面，标题、文字与装饰均可编辑。4:5 竖版，无缝拼接。`,
    width: WIDTH, height: HEIGHT, mode: 'free', layoutId: id, photoLayering: 'overlay',
    background: { color, pattern: 'none', patternColor: color, assetId: null },
    padding: 0, gap: 0, cornerRadius: 0, animation: 'none', photoFrames: contactFrames(count, style), elements,
  };
}

/** Fresh editable presets for the complete current photo collection; unsupported counts have no presets. */
export function photoPostersForCount(count: number): TemplatePreset[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COLLAGE_PHOTOS) return [];
  return (['cinema', 'fashion', 'support', 'calligraphy', 'memory'] as const).map(style => poster(count, style));
}
