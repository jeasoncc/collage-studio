import type { SceneElement, ShapeElement, TemplatePreset, TextElement } from '../types';
import { chineseFonts } from './photoText';
import { MAX_COLLAGE_PHOTOS } from './layouts';

type Frame = NonNullable<TemplatePreset['photoFrames']>[number];
type PosterStyle = 'cinema' | 'fashion' | 'support' | 'calligraphy' | 'memory'
  | 'dharma' | 'vesak' | 'practice' | 'lamps' | 'retreat' | 'celebration';
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
  if (style === 'dharma') {
    return [{ x: 0, y: 0, width: 1, height: .69 }, ...contactGrid(remaining, { x: 0, y: .69, width: 1, height: .31 })];
  }
  if (style === 'vesak') {
    return [{ x: .33, y: 0, width: .67, height: 1 }, ...contactGrid(remaining, { x: 0, y: 0, width: .33, height: 1 })];
  }
  if (style === 'lamps') {
    return [{ x: 0, y: .30, width: 1, height: .70 }, ...contactGrid(remaining, { x: 0, y: 0, width: 1, height: .30 })];
  }
  if (style === 'retreat') {
    if (count === 2) return [{ x: 0, y: 0, width: .74, height: 1 }, { x: .74, y: 0, width: .26, height: 1 }];
    const sideCount = Math.max(1, Math.min(remaining - 1, Math.round(remaining * .48)));
    return [
      { x: 0, y: 0, width: .74, height: .78 },
      ...contactGrid(sideCount, { x: .74, y: 0, width: .26, height: .78 }),
      ...contactGrid(remaining - sideCount, { x: 0, y: .78, width: 1, height: .22 }),
    ];
  }
  if (style === 'celebration') {
    if (count === 2) return [{ x: 0, y: 0, width: 1, height: .58 }, { x: 0, y: .58, width: 1, height: .42 }];
    const leftCount = Math.ceil(remaining / 2);
    return [
      { x: 0, y: 0, width: 1, height: .58 },
      ...contactGrid(leftCount, { x: 0, y: .58, width: .58, height: .42 }),
      ...contactGrid(remaining - leftCount, { x: .58, y: .58, width: .42, height: .42 }),
    ];
  }
  if (style === 'practice') {
    if (count === 2) return [{ x: .28, y: 0, width: .72, height: 1 }, { x: 0, y: 0, width: .28, height: 1 }];
    if (count === 3) return [
      { x: .16, y: 0, width: .68, height: 1 },
      { x: 0, y: 0, width: .16, height: 1 },
      { x: .84, y: 0, width: .16, height: 1 },
    ];
    if (count === 4) return [
      { x: .16, y: 0, width: .68, height: .78 },
      { x: 0, y: 0, width: .16, height: .78 },
      { x: .84, y: 0, width: .16, height: .78 },
      { x: 0, y: .78, width: 1, height: .22 },
    ];
    const stripCount = Math.floor(remaining / 4);
    const extra = remaining % 4;
    return [
      { x: .16, y: .14, width: .68, height: .72 },
      ...contactGrid(stripCount + (extra > 0 ? 1 : 0), { x: 0, y: 0, width: 1, height: .14 }),
      ...contactGrid(stripCount + (extra > 1 ? 1 : 0), { x: 0, y: .14, width: .16, height: .72 }),
      ...contactGrid(stripCount + (extra > 2 ? 1 : 0), { x: .84, y: .14, width: .16, height: .72 }),
      ...contactGrid(stripCount, { x: 0, y: .86, width: 1, height: .14 }),
    ];
  }
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
  } else if (style === 'memory') {
    name = '岁月，值得珍藏'; category = '纪念'; color = '#f5efe2';
    description = '上方连帧接住回忆，下方大幅主照记录相聚，温润文楷与半透明纪念签轻轻落在照片上。';
    elements = [
      shape('memory-wash', .045, .793, .91, .164, '#fff8e6e0'),
      shape('memory-rule', .078, .822, .075, .003, '#9c6a40'),
      text('eyebrow', '共同的回忆', .18, .809, .70, 29, '#735b43', { fontFamily: chineseFonts.fangsong }),
      text('title', '岁月，值得珍藏', .075, .848, .85, 76, '#33473b', { fontFamily: chineseFonts.kai }),
      text('deck', `同行的人，是最好的风景 · ${count} 帧珍藏`, .08, .918, .84, 28, '#735b43', { fontFamily: chineseFonts.fangsong }),
    ];
  } else if (style === 'dharma') {
    name = '法会 · 吉祥同愿'; category = '佛教道场'; color = '#b82724';
    description = '上方大幅主照与下方紧密连帧，朱红金边横题签，记录庄严又热烈的法会相聚。';
    elements = [
      shape('title-wash', 0, .49, 1, .20, '#b82724', { opacity: .96 }),
      shape('gold-rule', .045, .513, .91, .003, '#ffd36b'),
      text('eyebrow', '道场法会 · 同愿同行', .06, .525, .82, 27, '#ffe8ac'),
      text('title', '吉祥同愿', .052, .563, .77, 96, '#fff5d6', { fontFamily: chineseFonts.brush }),
      text('deck', '礼佛闻法 · 愿心常明', .06, .653, .79, 27, '#ffe8ac', { fontFamily: chineseFonts.kai }),
      shape('seal', .855, .563, .08, .066, '#ffd36b'),
      text('seal-text', '法喜', .855, .578, .08, 28, '#8b1e1d', { fontFamily: chineseFonts.serif, align: 'center' }),
      text('edition', `法会影记 · ${count} 帧`, .06, .035, .83, 29, '#fff5d6', { backgroundColor: '#a51f23', align: 'center' }),
    ];
  } else if (style === 'vesak') {
    name = '佛诞 · 花开见喜'; category = '佛教道场'; color = '#db4829';
    description = '右侧主照配左侧连帧，珊瑚朱红竖题、金色莲瓣与宋体小记，喜庆迎佛诞。';
    elements = [
      shape('title-sidebar', .35, .045, .18, .49, '#d64229', { opacity: .97 }),
      text('title', '花\n开\n见\n喜', .355, .063, .17, 110, '#fff0bc', { fontFamily: chineseFonts.serif, align: 'center', lineHeight: 1.18 }),
      shape('lotus-left', .389, .541, .034, .055, '#ffd56c', { shape: 'circle', rotation: -38 }),
      shape('lotus-right', .465, .541, .034, .055, '#ffd56c', { shape: 'circle', rotation: 38 }),
      shape('lotus-center', .427, .529, .036, .067, '#fff0bc', { shape: 'circle' }),
      shape('lotus-base', .389, .585, .11, .009, '#ffd56c'),
      shape('caption-wash', .35, .805, .61, .148, '#a62420', { opacity: .96 }),
      text('eyebrow', '佛诞浴佛 · 欢喜相聚', .38, .824, .55, 29, '#ffd56c', { fontFamily: chineseFonts.kai }),
      text('deck', '心生莲花，愿行芬芳', .38, .866, .55, 40, '#fff0bc', { fontFamily: chineseFonts.serif }),
      text('edition', `浴佛 · 礼赞 · ${count} 帧欢喜`, .38, .917, .55, 24, '#ffe0a0'),
    ];
  } else if (style === 'practice') {
    name = '共修 · 同心向善'; category = '佛教道场'; color = '#d95428';
    description = '中心主照被连帧环绕，藏红花金与朱红共修题签，留下同心同行的温暖。';
    elements = [
      shape('headline-wash', .19, .625, .62, .168, '#f5ac35', { opacity: .97 }),
      shape('headline-rule', .22, .645, .56, .004, '#b62422'),
      text('eyebrow', '道场共修 · 彼此照见', .22, .66, .56, 26, '#7e1b17', { fontFamily: chineseFonts.kai, align: 'center' }),
      text('title', '同心向善', .21, .697, .58, 86, '#8d1e19', { fontFamily: chineseFonts.display, align: 'center' }),
      text('deck', '诵经 · 念佛 · 分享善意', .22, .77, .56, 24, '#7e1b17', { align: 'center' }),
      shape('practice-tag', .27, .175, .46, .051, '#c62c25'),
      text('practice-label', `${count} 帧同行 · 共修影记`, .28, .188, .44, 27, '#fff2c2', { align: 'center' }),
    ];
  } else if (style === 'lamps') {
    name = '供灯 · 万盏心灯'; category = '佛教道场'; color = '#aa2025';
    description = '上方连帧衔接下方大幅主照，红金供灯横额与可编辑灯盏，温暖明亮不失庄严。';
    elements = [
      shape('lamp-banner', 0, .30, 1, .185, '#aa2025', { opacity: .97 }),
      text('eyebrow', '供灯祈愿 · 愿光相续', .055, .32, .67, 28, '#ffdc85'),
      text('title', '万盏心灯', .048, .362, .70, 100, '#fff2c2', { fontFamily: chineseFonts.serif }),
      text('deck', '点亮善愿，温暖同行', .055, .448, .70, 27, '#ffdc85', { fontFamily: chineseFonts.kai }),
      shape('flame', .835, .337, .04, .06, '#ffd15b', { shape: 'circle' }),
      shape('wick', .851, .385, .008, .024, '#fff2c2'),
      shape('lamp-bowl', .79, .403, .13, .044, '#f5a52d', { shape: 'circle' }),
      shape('lamp-base', .805, .435, .10, .012, '#ffd15b'),
      text('edition', `${count} 帧灯火 · 愿心光明`, .07, .917, .86, 32, '#fff2c2', { backgroundColor: '#aa2025', align: 'center' }),
    ];
  } else if (style === 'retreat') {
    name = '禅修 · 一念花开'; category = '佛教道场'; color = '#e36b2b';
    description = '左侧大幅主照连接右栏与底栏，橙金禅修纸签、朱砂纵线与文楷题字，明暖而安定。';
    elements = [
      shape('retreat-card', .035, .05, .63, .192, '#ffd78b', { opacity: .97 }),
      shape('retreat-rule', .055, .071, .007, .148, '#bc3023'),
      text('eyebrow', '道场禅修 · 安住当下', .085, .071, .54, 26, '#862b1b', { fontFamily: chineseFonts.fangsong }),
      text('title', '一念花开', .078, .112, .55, 87, '#a32920', { fontFamily: chineseFonts.kai }),
      text('deck', '静坐 · 经行 · 觉察', .085, .198, .54, 26, '#862b1b'),
      shape('retreat-foot', .035, .656, .65, .087, '#bf3523', { opacity: .96 }),
      text('caption', '在一呼一吸间，与善意相逢', .06, .675, .60, 29, '#fff2c2', { fontFamily: chineseFonts.kai }),
      text('edition', `${count} 帧暖心禅修`, .06, .716, .60, 22, '#ffe0a0'),
    ];
  } else {
    name = '法喜庆典 · 福慧满堂'; category = '佛教道场'; color = '#e54835';
    description = '上方主照与下方不对称双栏，鲜红、珊瑚与金色庆典条幅，热烈珍藏道场法喜。';
    elements = [
      shape('celebration-banner', 0, 0, 1, .175, '#d62b28', { opacity: .97 }),
      shape('gold-rule', .045, .022, .91, .004, '#ffd164'),
      text('title', '福慧满堂', .045, .041, .91, 110, '#fff0bc', { fontFamily: chineseFonts.display, align: 'center' }),
      text('eyebrow', '法喜庆典 · 欢喜同聚 · 善愿同行', .06, .14, .88, 28, '#ffe0a0', { align: 'center' }),
      shape('celebration-tag', .07, .478, .86, .079, '#ffbf54', { opacity: .97 }),
      text('deck', '把欢喜留在心间，把善意带向日常', .09, .496, .82, 36, '#8c201d', { fontFamily: chineseFonts.kai, align: 'center' }),
      text('edition', `${count} 帧法喜 · 道场相聚影记`, .07, .925, .86, 30, '#fff0bc', { backgroundColor: '#b52524', align: 'center' }),
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
  return (['cinema', 'fashion', 'support', 'calligraphy', 'memory', 'dharma', 'vesak', 'practice', 'lamps', 'retreat', 'celebration'] as const).map(style => poster(count, style));
}
