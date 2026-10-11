import { createDrawing, createElementBase } from '../defaults';
import type { AnimationKind, BackgroundSpec, DrawingElement, SceneElement, ShapeElement, TemplatePreset, TextElement } from '../types';
import { chineseFonts } from './photoText';
import { layouts } from './layouts';

const SQUARE = [1080, 1080] as const;
const PORTRAIT = [1080, 1440] as const;
const LANDSCAPE = [1440, 960] as const;
const ink = '#29342f';
const cream = '#f8f3e9';
type Frame = NonNullable<TemplatePreset['photoFrames']>[number];

function text(value: string, x: number, y: number, width: number, fontSize = 58, color = ink, extra: Partial<TextElement> = {}): TextElement {
  return {
    ...createElementBase('text'), type: 'text', x, y, width, height: fontSize * 1.5,
    text: value, fontFamily: chineseFonts.sans, fontSize, fontStyle: 'normal', color,
    align: 'center', lineHeight: 1.2, stroke: '', strokeWidth: 0, backgroundColor: 'transparent', curve: 0, ...extra,
  };
}
function shape(x: number, y: number, width: number, height: number, fill: string, extra: Partial<ShapeElement> = {}): ShapeElement {
  return { ...createElementBase('shape'), type: 'shape', x, y, width, height, shape: 'rect', fill, stroke: '', strokeWidth: 0, ...extra };
}
function line(points: number[], color: string, strokeWidth = 5): DrawingElement {
  return createDrawing({ points, color, width: strokeWidth, tool: 'pen' });
}
function frame(x: number, y: number, width: number, height: number, rotation = 0, borderWidth = 0, borderColor = '#ffffff'): Frame {
  return { x, y, width, height, rotation, borderWidth, borderColor };
}
function paper(x: number, y: number, width: number, height: number, rotation = 0): ShapeElement {
  return shape(x, y, width, height, '#ffffff', { rotation, shadow: 14 });
}
function confetti(width: number, height: number, colors: string[], animation: AnimationKind = 'none'): SceneElement[] {
  return Array.from({ length: 22 }, (_, i) => {
    const x = ((i * 173 + 39) % (width - 40));
    const y = i % 2 === 0 ? 40 + (i * 79) % 220 : height - 240 + (i * 61) % 180;
    return shape(x, y, i % 3 === 0 ? 28 : 12, i % 3 === 0 ? 28 : 42, colors[i % colors.length]!, { shape: i % 3 === 0 ? 'circle' : 'rect', rotation: i * 23, animation });
  });
}
function filmHoles(y: number, width: number): ShapeElement[] {
  return Array.from({ length: 18 }, (_, i) => shape(24 + i * (width - 48) / 18, y, 28, 18, '#ece2cf'));
}
function make(id: string, name: string, category: string, description: string, size: readonly [number, number], color: string, frames: Frame[], elements: SceneElement[], extra: Partial<TemplatePreset> = {}): TemplatePreset {
  return {
    id, name, category, description, width: size[0], height: size[1], mode: 'free', layoutId: 'grid-1',
    background: { color, pattern: 'none', patternColor: '#d8c8b3', assetId: null },
    padding: 36, gap: 20, cornerRadius: 0, animation: 'none', photoFrames: frames, elements, ...extra,
  };
}
function background(color: string, pattern: BackgroundSpec['pattern'], patternColor: string): BackgroundSpec {
  return { color, pattern, patternColor, assetId: null };
}

function photoCollection(id: string, name: string, layoutId: string, size: readonly [number, number], treatment: 'album' | 'contact' | 'film' | 'editorial', color: string, foreground: string): TemplatePreset {
  const layout = layouts.find(item => item.id === layoutId)!;
  const [width, height] = size;
  const gutter = treatment === 'album' ? 18 : treatment === 'film' ? 12 : 10;
  const frames = layout.slots.map(slot => frame(
    .05 + slot.x * .9 + gutter / width,
    .15 + slot.y * .75 + gutter / height,
    slot.width * .9 - gutter * 2 / width,
    slot.height * .75 - gutter * 2 / height,
    0, treatment === 'contact' ? 2 : treatment === 'film' ? 4 : 0,
    treatment === 'film' ? '#d2b77d' : foreground,
  ));
  const decorations: SceneElement[] = [
    text(name, width * .05, height * .035, width * .9, treatment === 'editorial' ? 68 : 48, foreground, { align: 'left', fontFamily: treatment === 'editorial' ? chineseFonts.serif : chineseFonts.sans }),
    text(`${layout.count} FRAMES / A PERSONAL COLLECTION`, width * .05, height * .105, width * .9, 19, foreground, { align: 'left' }),
    text('按下快门的瞬间，都在这里。', width * .05, height * .94, width * .9, 25, foreground, { align: 'left' }),
  ];
  if (treatment === 'album') {
    frames.forEach((photo, index) => {
      const x = photo.x * width, y = photo.y * height;
      decorations.push(shape(x - 9, y - 9, photo.width * width + 18, photo.height * height + 26, '#fffefa', { shadow: 3 }));
      decorations.push(text(String(index + 1).padStart(2, '0'), x, y + photo.height * height + 2, photo.width * width, 11, '#8a8174', { align: 'left' }));
    });
  } else if (treatment === 'film') {
    decorations.push(...filmHoles(height * .135, width), ...filmHoles(height * .915, width));
  } else {
    decorations.push(line([width * .05, height * .135, width * .95, height * .135], foreground, treatment === 'editorial' ? 4 : 1));
    decorations.push(line([width * .05, height * .925, width * .95, height * .925], foreground, 1));
  }
  return make(id, name, '照片集', `${layout.count} 张照片 · ${layout.name}。照片、相纸、标题与装饰均可继续编辑。`, size, color, frames, decorations,
    { padding: 36, gap: gutter * 2, background: background(color, treatment === 'album' ? 'paper' : 'none', '#ded5c7') });
}

export const chineseFestivals: readonly { id: string; label: string; templateIds: readonly string[] }[] = [
  { id: 'spring-festival', label: '春节', templateIds: ['festival-spring-reunion'] },
  { id: 'lantern-festival', label: '元宵', templateIds: ['festival-lantern-night'] },
  { id: 'qingming', label: '清明', templateIds: ['festival-qingming-remembrance'] },
  { id: 'labour-day', label: '劳动节', templateIds: ['festival-labour-life'] },
  { id: 'dragon-boat', label: '端午', templateIds: ['festival-dragon-boat'] },
  { id: 'childrens-day', label: '儿童节', templateIds: ['festival-childhood'] },
  { id: 'qixi', label: '七夕', templateIds: ['festival-qixi-together'] },
  { id: 'mid-autumn', label: '中秋', templateIds: ['festival-mid-autumn'] },
  { id: 'national-day', label: '国庆', templateIds: ['festival-national-travel'] },
  { id: 'double-ninth', label: '重阳', templateIds: ['festival-double-ninth'] },
  { id: 'new-years-day', label: '元旦', templateIds: ['festival-new-year'] },
];

export const templateCategories = ['全部', '节日', '照片集', '极简', '胶片', '拍立得', '手帐', '生日', '旅行', '杂志', '动态'];

export const templates: TemplatePreset[] = [
  make('festival-spring-reunion', '春节 · 团圆有福', '节日', '3 张照片紧密相连。朱红与暖金写下春节的团圆，家人、年夜饭与新春心愿都值得珍藏。', PORTRAIT, '#9a2926',
    [frame(0, 0, .62, 1), frame(.62, 0, .38, .5), frame(.62, .5, .38, .5)],
    [shape(0, 1110, 1080, 330, '#8b2026', { opacity: .93 }), line([56, 1150, 1024, 1150], '#e9c88c', 2),
      text('春节 · 家在一起', 62, 1174, 956, 28, '#f4d9a3', { align: 'left' }),
      text('团圆有福', 56, 1226, 960, 112, '#ffe5ac', { fontFamily: chineseFonts.brush, align: 'left' }),
      text('把相聚的温暖，留在这一年。', 62, 1364, 950, 28, '#f8e7cb', { align: 'left' })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-lantern-night', '元宵 · 灯火可亲', '节日', '2 张竖向照片无缝相邻。夜蓝与灯笼暖红，记录元宵赏灯、汤圆与团圆的夜晚。', PORTRAIT, '#172a32',
    [frame(0, .19, .5, .81), frame(.5, .19, .5, .81)],
    [shape(0, 0, 1080, 274, '#172a32'),
      line([102, 0, 102, 57], '#e7b970', 3), shape(57, 56, 90, 115, '#bf5143', { shape: 'circle' }), line([102, 171, 102, 210], '#e7b970', 4),
      line([978, 0, 978, 57], '#e7b970', 3), shape(933, 56, 90, 115, '#bf5143', { shape: 'circle' }), line([978, 171, 978, 210], '#e7b970', 4),
      text('灯火可亲', 160, 52, 760, 100, '#f6dbac', { fontFamily: chineseFonts.serif }),
      text('元宵佳节 · 人间团圆', 165, 183, 750, 30, '#eac49c'),
      shape(0, 1304, 1080, 136, '#172a32', { opacity: .86 }), text('一盏灯，一碗圆，一家人。', 70, 1346, 940, 32, '#fff0d5')],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-qingming-remembrance', '清明 · 念念在心', '节日', '2 张照片上下连缀。素绿、细枝与温润宋体，适合清明追思或踏青，静静珍藏思念。', PORTRAIT, '#e8ede3',
    [frame(0, 0, 1, .68), frame(0, .68, 1, .32)],
    [shape(54, 58, 428, 238, '#edf1e8', { opacity: .92 }), text('清明', 84, 83, 366, 96, '#415849', { fontFamily: chineseFonts.serif, align: 'left' }),
      text('念念在心 · 岁岁相忆', 90, 212, 364, 26, '#607264', { align: 'left' }),
      line([934, 54, 922, 137, 947, 203, 932, 268], '#607264', 3), line([925, 123, 883, 99], '#607264', 2), line([943, 190, 985, 160], '#607264', 2),
      shape(0, 1300, 1080, 140, '#e8ede3', { opacity: .94 }), text('春风有信，思念有归处。', 64, 1347, 952, 32, '#415849', { fontFamily: chineseFonts.kai })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-labour-life', '劳动节 · 认真生活', '节日', '4 张照片拼成无缝方形。记录劳动节的手作、工作与休息，把认真生活的每一面都留住。', SQUARE, '#f4ede1',
    [frame(0, 0, .5, .5), frame(.5, 0, .5, .5), frame(0, .5, .5, .5), frame(.5, .5, .5, .5)],
    [shape(164, 423, 752, 234, '#fff8e9', { opacity: .94 }), shape(164, 423, 8, 234, '#b55236'),
      text('劳动节 · 致每一份热爱', 210, 449, 660, 27, '#8b563f'),
      text('认真生活', 210, 502, 660, 92, '#35483e', { fontFamily: chineseFonts.display }),
      text('付出有光，休息也有意义。', 210, 616, 660, 25, '#6f7664')],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-dragon-boat', '端午 · 粽香安康', '节日', '3 张照片紧密拼接。竹绿与粽叶几何，记录端午包粽、龙舟和家常时光，送一声安康。', PORTRAIT, '#244d3d',
    [frame(0, 0, 1, .65), frame(0, .65, .5, .35), frame(.5, .65, .5, .35)],
    [shape(0, 0, 1080, 240, '#1f4939', { opacity: .9 }),
      text('端午安康', 62, 35, 792, 102, '#f3eac9', { fontFamily: chineseFonts.brush, align: 'left' }),
      text('粽叶裹清香，日子有回甘。', 70, 169, 784, 29, '#d5dfc2', { align: 'left' }),
      line([942, 36, 942, 208], '#b7c89a', 5), line([923, 85, 963, 85], '#b7c89a', 3), line([923, 153, 963, 153], '#b7c89a', 3),
      shape(883, 68, 37, 76, '#b7c89a', { shape: 'circle', rotation: -32 }), shape(965, 132, 37, 76, '#b7c89a', { shape: 'circle', rotation: 32 })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-childhood', '儿童节 · 童心万岁', '节日', '3 张照片组成紧凑故事。奶油黄与彩色圆点，记录儿童节的奔跑、游戏和小小愿望。', PORTRAIT, '#fff1cd',
    [frame(0, 0, 1, .62), frame(0, .62, .5, .38), frame(.5, .62, .5, .38)],
    [shape(0, 1200, 1080, 240, '#fff1cd', { opacity: .96 }), shape(875, 1252, 82, 82, '#e98568', { shape: 'circle' }),
      shape(948, 1331, 40, 40, '#81a99a', { shape: 'circle' }), shape(897, 1353, 30, 30, '#ddbf65', { shape: 'circle' }),
      text('儿童节 · 把快乐定格', 64, 1232, 744, 27, '#776c42', { align: 'left' }),
      text('童心万岁', 57, 1270, 770, 98, '#315748', { fontFamily: chineseFonts.display, align: 'left' }),
      text('长大，也别忘了好奇。', 64, 1390, 760, 26, '#776c42', { align: 'left' })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-qixi-together', '七夕 · 与你朝夕', '节日', '2 张照片上下相连。温柔的浅藕色纸签与小小爱心，把七夕的陪伴写成两个人的故事。', PORTRAIT, '#efe2df',
    [frame(0, 0, 1, .5), frame(0, .5, 1, .5)],
    [shape(150, 610, 780, 220, '#fff3ed', { opacity: .94 }),
      text('七夕 · 两个人的日常', 192, 635, 696, 26, '#93685f'),
      text('与你，朝夕', 191, 685, 698, 90, '#704b48', { fontFamily: chineseFonts.serif }),
      text('喜欢，是每一个有你的此刻。', 195, 794, 690, 25, '#93685f'),
      shape(946, 65, 64, 60, '#b77175', { shape: 'heart', opacity: .9 })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-mid-autumn', '中秋 · 月满人团圆', '节日', '3 张照片无缝连缀。深夜蓝、圆月与暖金字，记录中秋团圆、月饼与窗前月色。', PORTRAIT, '#202f49',
    [frame(0, 0, 1, .64), frame(0, .64, .5, .36), frame(.5, .64, .5, .36)],
    [shape(0, 1160, 1080, 280, '#202f49', { opacity: .92 }), shape(886, 1210, 130, 130, '#edcf97', { shape: 'circle' }),
      text('中秋 · 此心有归处', 62, 1196, 790, 28, '#e3cea8', { align: 'left' }),
      text('月满人团圆', 56, 1242, 810, 100, '#ffe7b5', { fontFamily: chineseFonts.serif, align: 'left' }),
      text('无论远近，共此一轮明月。', 62, 1366, 840, 29, '#e3cea8', { align: 'left' })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-national-travel', '国庆 · 山河漫游', '节日', '4 张照片连成无缝旅行画报。国庆假期的山川、城市与沿途风景，用暖白纸签和朱红标记收藏。', PORTRAIT, '#f6efdf',
    [frame(0, 0, .66, .5), frame(.66, 0, .34, .5), frame(0, .5, .34, .5), frame(.34, .5, .66, .5)],
    [shape(0, 1220, 1080, 220, '#f6efdf', { opacity: .96 }), shape(58, 1254, 124, 42, '#a43d32'),
      text('国庆', 60, 1258, 120, 25, '#fff0d7'),
      text('山河漫游', 214, 1245, 804, 92, '#374639', { fontFamily: chineseFonts.serif, align: 'left' }),
      line([60, 1360, 1016, 1360], '#b7b39b', 2), text('走过山海，把辽阔留在心里。', 60, 1383, 956, 26, '#6d7461', { align: 'left' })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-double-ninth', '重阳 · 秋暖长相伴', '节日', '2 张照片紧密并肩。暖秋赭色与细枝，记录重阳登高、陪伴长辈与久长的温情。', LANDSCAPE, '#eadcc4',
    [frame(0, 0, .5, 1), frame(.5, 0, .5, 1)],
    [shape(0, 746, 1440, 214, '#eadcc4', { opacity: .95 }),
      text('重阳 · 陪伴是最长情的念想', 62, 774, 1070, 27, '#856447', { align: 'left' }),
      text('秋暖，长相伴', 55, 820, 1090, 82, '#5c4d37', { fontFamily: chineseFonts.kai, align: 'left' }),
      line([1250, 909, 1280, 810, 1304, 766], '#9a7844', 4),
      shape(1214, 829, 52, 27, '#b88648', { shape: 'circle', rotation: 24 }), shape(1290, 798, 54, 28, '#bc9459', { shape: 'circle', rotation: -24 })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('festival-new-year', '元旦 · 新岁有光', '节日', '1 张照片的清新元旦封面。不限定年份，写下新的心愿，用自己的照片迎接新的一页。', PORTRAIT, '#eef0dc',
    [frame(0, 0, 1, 1)],
    [shape(0, 0, 1080, 246, '#eef0dc', { opacity: .94 }),
      text('元旦 · 新的一页', 64, 35, 952, 28, '#64735a', { align: 'left' }),
      text('新岁有光', 56, 87, 962, 112, '#315748', { fontFamily: chineseFonts.display, align: 'left' }),
      shape(64, 1282, 952, 100, '#eef0dc', { opacity: .93 }), text('愿新的一年，仍有热爱与期待。', 94, 1310, 892, 32, '#315748', { fontFamily: chineseFonts.kai })],
    { photoLayering: 'overlay', padding: 0, gap: 0 }),
  make('quiet-morning', '晨光留白', '极简', '一张照片，一句心情，给日常留一点呼吸。', PORTRAIT, '#faf9f6',
    [frame(.1, .18, .8, .61)], [text('little moments', 108, 78, 864, 50, ink, { fontFamily: 'Caveat' }), text('把日常，过成喜欢的样子', 108, 1205, 864, 34, '#7b827c'), line([108, 1170, 972, 1170], '#d0d5cf', 2)]),
  make('parallel-days', '并行日记', '极简', '两幅竖向照片，干净边距与柔和圆角。', SQUARE, '#e9f1e8', [], [],
    { mode: 'grid', layoutId: 'grid-2', padding: 66, gap: 28, cornerRadius: 18 }),
  make('wide-gallery', '横向画廊', '极简', '三联摄影横幅，适合风景与空间记录。', LANDSCAPE, '#eeece6', [], [],
    { mode: 'grid', layoutId: 'stack-3', padding: 44, gap: 18, cornerRadius: 0 }),
  make('color-study', '色彩切片', '极简', '四色块与错位照片组成的现代几何拼贴。', SQUARE, '#fff7e9',
    [frame(.08, .12, .45, .43), frame(.57, .37, .35, .46)],
    [shape(0, 0, 1080, 80, '#c9553a'), shape(560, 90, 420, 240, '#d9d69f'), shape(85, 685, 480, 280, '#a4c4ba'), text('COLOR / 04', 610, 920, 380, 36, '#b5543a', { align: 'right' })]),

  make('contact-sheet', '六格底片', '胶片', '黑色片基上的六格接触印相，完整保留照片比例。', PORTRAIT, '#171918', [], [],
    { mode: 'grid', layoutId: 'grid-6', padding: 50, gap: 26, cornerRadius: 0 }),
  make('weekend-film', '周末电影', '胶片', '横向双底片与原创片孔装饰。', LANDSCAPE, '#202321',
    [frame(.05, .15, .43, .66), frame(.52, .15, .43, .66)],
    [...filmHoles(56, 1440), ...filmHoles(860, 1440), text('WEEKEND / 35 MM', 70, 795, 1300, 28, '#e4c681', { align: 'left' })]),
  make('film-story', '三幕故事', '胶片', '三张横向照片，像电影一样保存一天。', PORTRAIT, '#292722',
    [frame(.09, .09, .82, .23), frame(.09, .37, .82, .23), frame(.09, .65, .82, .23)],
    [text('01 / FIRST LIGHT', 100, 462, 850, 22, '#ead9b4', { align: 'left' }), text('02 / ON THE WAY', 100, 865, 850, 22, '#ead9b4', { align: 'left' }), text('03 / GOOD NIGHT', 100, 1268, 850, 22, '#ead9b4', { align: 'left' }), text('A DAY TO REMEMBER', 100, 1330, 880, 30, '#ead9b4')]),

  make('polaroid-note', '给未来的便笺', '拍立得', '一张白边相纸，手写一句想留住的话。', PORTRAIT, '#e8dfd1',
    [frame(.17, .18, .66, .51, -4)],
    [paper(145, 228, 780, 920, -4), text('remember this day', 180, 1010, 720, 65, '#454b42', { fontFamily: 'Caveat', rotation: -4 }), text('每一个此刻，都值得收藏', 100, 1250, 880, 34, '#787060')]),
  make('two-of-us', '我们俩', '拍立得', '两张倾斜相纸，给朋友和喜欢的人。', SQUARE, '#eee6dd',
    [frame(.075, .18, .38, .44, -8), frame(.55, .24, .37, .44, 7)],
    [paper(58, 170, 445, 645, -8), paper(570, 232, 437, 645, 7), text('you & me', 70, 740, 400, 63, '#56504a', { fontFamily: 'Caveat', rotation: -8 }), text('always', 560, 805, 430, 60, '#56504a', { fontFamily: 'Caveat', rotation: 7 }), shape(492, 100, 90, 80, '#d47d77', { shape: 'heart' })]),
  make('memory-wall', '记忆小墙', '拍立得', '四张白边照片，像墙上的小小收藏。', LANDSCAPE, '#e0e6df',
    [frame(.055, .15, .2, .52, -5), frame(.285, .23, .2, .52, 4), frame(.525, .14, .2, .52, -3), frame(.76, .23, .2, .52, 5)],
    [paper(62, 130, 310, 635, -5), paper(393, 208, 310, 635, 4), paper(739, 121, 310, 635, -3), paper(1077, 207, 310, 635, 5), text('our small collection', 200, 860, 1040, 50, '#5e7063', { fontFamily: 'Caveat' })]),

  make('paper-week', '碎纸周记', '手帐', '暖色纸页、胶带和三张错落照片。', PORTRAIT, cream,
    [frame(.08, .2, .5, .34, -5), frame(.58, .33, .35, .3, 7), frame(.19, .64, .55, .25, -2)],
    [paper(70, 268, 570, 530, -5), paper(610, 451, 410, 485, 7), paper(185, 896, 630, 415, -2), shape(160, 246, 265, 56, '#dbc889', { opacity: .8, rotation: -12 }), shape(688, 436, 218, 53, '#dbc889', { opacity: .8, rotation: 16 }), text('这一周的小确幸', 80, 88, 910, 62, '#73654f', { fontFamily: chineseFonts.brush }), text('慢慢收集 / 慢慢喜欢', 260, 1320, 700, 28, '#92826c')],
    { background: background(cream, 'paper', '#d7cbbb') }),
  make('notebook', '植物观察簿', '手帐', '圆形照片与笔记线条，适合记录花草与生活。', PORTRAIT, '#f1f3e7',
    [{ ...frame(.18, .18, .64, .48), shape: 'circle' }, frame(.12, .74, .28, .17, -3)],
    [text('botanical diary', 100, 76, 880, 72, '#4d6347', { fontFamily: 'Caveat' }), line([490, 1120, 955, 1120], '#a8b39b', 3), line([490, 1190, 955, 1190], '#a8b39b', 3), line([490, 1260, 955, 1260], '#a8b39b', 3), text('今天也有好好生活', 490, 1010, 465, 30, '#63745a'), shape(86, 220, 38, 100, '#9caf82', { shape: 'circle', rotation: -35 }), shape(940, 760, 40, 120, '#9caf82', { shape: 'circle', rotation: 35 })]),
  make('picnic-notes', '野餐手帖', '手帐', '小格纹桌布上的四格周末照片。', SQUARE, '#f5efe4', [], [],
    { mode: 'grid', layoutId: 'grid-4', padding: 86, gap: 30, cornerRadius: 4, background: background('#f5efe4', 'checker', '#e5cdbb') }),

  make('birthday-wish', '生日愿望', '生日', '单张圆形主角照片与彩色纸屑。', PORTRAIT, '#fff2e8',
    [{ ...frame(.16, .24, .68, .51), shape: 'circle', borderWidth: 14, borderColor: '#ffffff' }],
    [...confetti(1080, 1440, ['#e99685', '#8dbca7', '#edca68']), text('HAPPY BIRTHDAY', 80, 92, 920, 68, '#c66152', { fontFamily: 'Playfair Display' }), text('愿每一天，都闪闪发光', 90, 1195, 900, 42, '#bd7162'), text('MAKE A WISH', 150, 1300, 780, 29, '#b1967c')]),
  make('birthday-invite', '生日派对邀请', '生日', '左图右文的邀请卡，可直接编辑时间地点。', LANDSCAPE, '#eee2fc',
    [frame(.07, .14, .41, .72, 0, 10, '#ffffff')],
    [text('LET’S\nCELEBRATE', 760, 155, 575, 88, '#725496', { fontFamily: 'Playfair Display', height: 245 }), text('生日快乐', 760, 446, 575, 54, '#725496'), line([815, 548, 1280, 548], '#ad92c3', 3), text('周六 18:00\n地点：我们的小天地\n与你一起，快乐加倍', 770, 601, 565, 32, '#7c648f', { height: 190, lineHeight: 1.6 })]),
  make('party-three', '派对三连拍', '生日', '大主角加两张小照片的快乐组合。', SQUARE, '#fbe2ae', [], [],
    { mode: 'grid', layoutId: 'hero-3', padding: 54, gap: 22, cornerRadius: 34 }),

  make('boarding-pass', '下一站，出发', '旅行', '原创登机牌式旅行拼贴，双图与票根信息。', LANDSCAPE, '#f3eedf',
    [frame(.04, .25, .38, .64), frame(.445, .25, .32, .64)],
    [shape(1150, 0, 290, 960, '#b5cfc9'), text('BOARDING / LIFE', 58, 52, 1000, 58, '#345d59', { align: 'left' }), text('下一站：世界', 60, 142, 1000, 35, '#64827b', { align: 'left' }), line([1120, 60, 1120, 900], '#6d9c90', 3), text('GO', 1165, 260, 240, 106, '#345d59', { fontStyle: 'bold' }), text('一路向前\n收集风景', 1165, 450, 240, 35, '#345d59', { height: 145, lineHeight: 1.7 }), ...Array.from({ length: 20 }, (_, i) => shape(1190 + i * 9, 746, i % 3 === 0 ? 5 : 2, 88, '#345d59'))]),
  make('city-stops', '城市漫游', '旅行', '四站旅途、路线与旅行日期的地图式手帐。', PORTRAIT, '#e8eeea',
    [frame(.08, .19, .38, .25), frame(.56, .25, .36, .23), frame(.08, .56, .36, .25), frame(.56, .62, .36, .25)],
    [text('CITY WALKS', 75, 70, 930, 85, '#3b6662', { fontFamily: 'Playfair Display' }), line([485, 350, 538, 490, 490, 750, 560, 1050], '#7c9c8c', 6), ...[350, 750, 1050].map(y => shape(476, y, 27, 27, '#c59159', { shape: 'circle' })), text('01 / 街角', 80, 640, 400, 30, '#526d60', { align: 'left' }), text('02 / 远方', 602, 703, 380, 30, '#526d60', { align: 'left' }), text('03 / 晚风', 80, 1187, 400, 30, '#526d60', { align: 'left' }), text('04 / 归途', 602, 1260, 380, 30, '#526d60', { align: 'left' })]),
  make('postcard', '远方来信', '旅行', '横向风景明信片，加上一句问候。', LANDSCAPE, '#f7f0df',
    [frame(.035, .055, .93, .72)],
    [text('Greetings from somewhere beautiful', 52, 775, 1170, 48, '#72644b', { fontFamily: 'Caveat', align: 'left' }), shape(1255, 775, 116, 116, 'transparent', { stroke: '#c6ad82', strokeWidth: 5 }), text('给你', 1260, 800, 105, 30, '#ad9168'), text('愿我们一直，心怀远方', 58, 867, 1150, 26, '#96866d', { align: 'left' })]),
  make('mountain-journal', '山野日记', '旅行', '一幅大风景与两张旅途细节。', PORTRAIT, '#233d36', [],
    [text('OUTSIDE / 山野之间', 60, 30, 960, 37, '#e1e6d7')],
    { mode: 'grid', layoutId: 'hero-top-3', padding: 86, gap: 24, cornerRadius: 0 }),

  make('winter-letter', '冬日祝福', '节日', '松绿色双照片与原创星形冬日装饰。', PORTRAIT, '#eaf0e8',
    [frame(.08, .26, .4, .49, -3, 12), frame(.52, .26, .4, .49, 3, 12)],
    [text('暖暖冬日', 70, 93, 940, 87, '#355a49', { fontFamily: chineseFonts.serif }), text('Warm wishes, always', 100, 1190, 880, 62, '#355a49', { fontFamily: 'Caveat' }), shape(475, 1080, 120, 120, '#b99b55', { shape: 'star' }), ...[100, 900, 230, 790].map((x, i) => shape(x, 230 + i % 2 * 40, 32, 32, '#b99b55', { shape: 'star' }))]),
  make('new-chapter', '新年新篇章', '节日', '红金色的横向纪念照片，不限定年份。', LANDSCAPE, '#a54038',
    [frame(.045, .09, .61, .82, 0, 10, '#f0d7a5')],
    [text('新\n篇\n章', 1030, 110, 290, 126, '#f6dfad', { fontFamily: chineseFonts.serif, height: 500, lineHeight: 1.1 }), line([1000, 85, 1000, 875], '#d49b5e', 3), text('所有美好 · 正在发生', 1030, 730, 300, 28, '#f6dfad', { height: 96 })]),
  make('autumn-table', '秋日餐桌', '节日', '暖棕色三图记录团聚、食物与季节。', SQUARE, '#d8b695', [], [],
    { mode: 'grid', layoutId: 'asymmetric-3', padding: 54, gap: 25, cornerRadius: 12, background: background('#d8b695', 'paper', '#b99170') }),

  make('life-cover', '生活封面', '杂志', '可编辑的大标题、封面照片与侧边故事。', PORTRAIT, '#fbf7ef',
    [frame(.055, .205, .89, .68)],
    [text('MOMENTS', 35, 25, 1010, 143, '#292d29', { fontFamily: 'Playfair Display' }), text('THE EVERYDAY ISSUE', 56, 183, 900, 26, '#6d6b61', { align: 'left' }), text('生活\n自有光芒', 105, 1120, 800, 94, '#ffffff', { fontFamily: chineseFonts.serif, height: 244, align: 'left', shadow: 5 }), text('VOL. 01    /    YOUR OWN STORY', 55, 1340, 980, 25, '#67675e')]),
  make('editorial-spread', '周刊跨页', '杂志', '两张摄影与右侧编辑文字的宽屏版式。', LANDSCAPE, '#f3f2ee',
    [frame(.035, .23, .38, .67), frame(.44, .23, .25, .43)],
    [text('THE SLOW ISSUE', 50, 45, 1340, 112, '#303632', { fontFamily: 'Playfair Display', align: 'left' }), line([50, 178, 1390, 178], '#8a8d84', 3), text('在慢下来的时候\n看见生活的细节', 1030, 247, 340, 51, '#303632', { fontFamily: chineseFonts.serif, height: 190, align: 'left' }), text('不必赶路\n也不必着急\n把今天的心情\n留在这两张照片里', 1030, 525, 340, 30, '#6e746a', { align: 'left', height: 240, lineHeight: 1.7 }), text('A NOTE TO MYSELF', 637, 694, 348, 27, '#6e746a', { align: 'left' }), text('每一帧，都是自己。', 637, 751, 348, 31, '#303632', { align: 'left' })]),
  make('monochrome-four', '黑白档案', '杂志', '四格摄影档案，简洁的黑白外框。', SQUARE, '#1f2421', [], [],
    { mode: 'grid', layoutId: 'grid-4', padding: 40, gap: 10, cornerRadius: 0 }),
  make('type-play', '字体实验室', '杂志', '大胆字号、暖红色纸面和两张错位摄影。', PORTRAIT, '#e6b7a0',
    [frame(.07, .34, .58, .43), frame(.7, .49, .24, .3)],
    [text('LIVE', 40, 42, 1000, 215, '#722e2d', { fontFamily: 'Playfair Display', align: 'left' }), text('a little louder', 55, 278, 980, 83, '#722e2d', { fontFamily: 'Caveat', align: 'left' }), text('热爱\n不设限', 755, 1230, 260, 51, '#722e2d', { align: 'right', height: 150 }), text('MAKE / YOUR / MARK', 78, 1170, 600, 31, '#722e2d', { align: 'left' }), line([78, 1240, 675, 1240], '#722e2d', 4)]),

  make('floating-love', '心动漂浮', '动态', '双图与轻轻漂浮的原创爱心，可导出动态。', PORTRAIT, '#fbe8ed',
    [frame(.1, .23, .8, .3, -3, 12), frame(.1, .58, .8, .3, 3, 12)],
    [text('love, in little things', 60, 95, 960, 76, '#bd6985', { fontFamily: 'Caveat' }), ...[100, 810, 450, 940].map((x, i) => shape(x, [250, 755, 1290, 159][i]!, 75, 72, ['#dd8ca8', '#eab8b7'][i % 2]!, { shape: 'heart', animation: 'float', rotation: i * 9 }))]),
  make('orbit-day', '星星围着你', '动态', '圆形照片与呼吸闪烁的星星。', SQUARE, '#262c51',
    [{ ...frame(.18, .16, .64, .64), shape: 'circle', borderWidth: 12, borderColor: '#c7c8ef' }],
    [text('you are my universe', 60, 913, 960, 58, '#f0dfb5', { fontFamily: 'Caveat' }), ...[[70, 200], [850, 100], [900, 750], [80, 850], [420, 35]].map(([x, y], i) => shape(x!, y!, 50 + i * 7, 50 + i * 7, '#e9cc85', { shape: 'star', animation: 'pulse', rotation: i * 12 }))]),
  make('happy-pop', '快乐蹦出来', '动态', '四格亮色拼贴，彩纸与标题跳跃登场。', SQUARE, '#fff2c8', [],
    [...confetti(1080, 1080, ['#f39782', '#80bca9', '#ad91ca'], 'pop'), text('GOOD TIMES!', 50, 35, 980, 63, '#af6450', { fontFamily: 'Caveat', animation: 'wiggle' })],
    { mode: 'grid', layoutId: 'grid-4', padding: 132, gap: 28, cornerRadius: 24 }),
  make('sunset-fade', '落日慢慢来', '动态', '横向照片与渐显文字，适合安静的视频明信片。', LANDSCAPE, '#edc7a3',
    [frame(.04, .065, .92, .72)],
    [text('stay a little longer', 80, 782, 1280, 75, '#7e5949', { fontFamily: 'Caveat', animation: 'fade' }), shape(1260, 770, 85, 85, '#c78964', { shape: 'circle', animation: 'pulse' })]),
  photoCollection('album-thirteen', '十三帧日常', 'grid-13', PORTRAIT, 'album', '#e9e1d2', '#605848'),
  photoCollection('contact-fourteen', '十四张接触印相', 'stack-14', PORTRAIT, 'contact', '#f7f6f1', '#34453c'),
  photoCollection('film-fifteen', '十五格胶片档案', 'stack-15', PORTRAIT, 'film', '#20231f', '#e4cf9f'),
  photoCollection('editorial-sixteen', '十六帧专题', 'hero-top-16', PORTRAIT, 'editorial', '#f4f1e9', '#343c35'),
  photoCollection('portrait-sixteen', '人物观察集', 'contact-tall-16', LANDSCAPE, 'contact', '#e7ece5', '#455d4b'),
  photoCollection('paired-seventeen', '双页旅途', 'mosaic-17', PORTRAIT, 'album', '#e5e0d4', '#6b5848'),
  photoCollection('chapters-eighteen', '生活的十八章', 'asymmetric-18', PORTRAIT, 'editorial', '#efe8dc', '#725342'),
  photoCollection('narrative-nineteen', '十九帧山海', 'hero-19', LANDSCAPE, 'editorial', '#e4ebe5', '#294c40'),
  photoCollection('wall-twenty', '二十张记忆墙', 'grid-20', SQUARE, 'album', '#ece5da', '#645b4e'),
  photoCollection('film-twenty', '二十格底片', 'stack-20', PORTRAIT, 'film', '#222622', '#e8d5ac'),
];
