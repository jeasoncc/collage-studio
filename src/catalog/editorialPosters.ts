import { chineseFonts } from './photoText';
import { cornerFrames, edgeFrames, posterElements, type PosterDesign } from './posterDesign';

export const editorialPosterDesigns: readonly PosterDesign[] = [
  {
    key: 'swiss-city',
    name: '城市，另一个视角',
    category: '极简',
    description: '瑞士平面风格的朱红编号、奶油纸块与不对称黑体标题。',
    color: '#eee9dc',
    frames: (count) => edgeFrames(count, 'left', .72),
    elements: (_count, id) => {
      const { text, shape } = posterElements(id);
      const red = '#d93625';
      const cream = '#f3eee1';
      const ink = '#20201e';
      return [
        shape('number-block', .04, .04, .62, .17, red),
        text('number', '01', .062, .036, .36, 166, cream, { fontFamily: 'DM Sans Variable', fontStyle: 'bold', lineHeight: 1 }),
        text('index', 'CITY\nSTUDIES', .455, .075, .18, 27, cream, { fontFamily: 'DM Sans Variable', fontStyle: 'bold', lineHeight: 1.05 }),
        shape('title-paper', .04, .21, .62, .235, cream),
        text('title', '城市，\n另一个视角', .068, .231, .565, 73, ink, { fontStyle: 'bold', lineHeight: 1.08 }),
        shape('title-rule', .07, .403, .1, .006, red),
        text('title-note', '街道之间，重新观看。', .195, .394, .43, 21, ink),
        shape('caption-paper', .04, .867, .62, .088, cream),
        shape('caption-marker', .04, .867, .012, .088, red),
        text('caption', '从熟悉的地方，发现新的线索', .071, .887, .54, 23, ink),
        text('photo-count', 'CITY VIEWS / 一组城市观察', .071, .921, .54, 17, ink, { fontFamily: chineseFonts.sans }),
      ];
    },
  },
  {
    key: 'gallery-day',
    name: '把日常，办成展',
    category: '极简',
    description: '美术馆展签式留白、细线与宋体，让普通片刻成为私人展览。',
    color: '#f5f2e9',
    frames: (count) => cornerFrames(count, 'top-right', .74, .76),
    elements: (_count, id) => {
      const { text, shape } = posterElements(id);
      const paper = '#f5f2e9';
      const ink = '#393a35';
      return [
        shape('catalogue-paper', .32, .045, .61, .065, paper),
        text('catalogue', 'THE EVERYDAY COLLECTION', .344, .063, .455, 18, ink, { fontFamily: 'DM Sans Variable' }),
        text('catalogue-number', 'I', .823, .058, .08, 25, ink, { fontFamily: 'Playfair Display', align: 'right' }),
        shape('label-paper', .32, .435, .61, .285, paper),
        shape('label-top-rule', .348, .459, .554, .001, ink),
        text('label-index', '私人收藏 / 日常影像', .349, .473, .48, 18, ink),
        text('title', '把日常，\n办成展', .349, .505, .525, 57, ink, { fontFamily: chineseFonts.serif, lineHeight: 1.13 }),
        shape('label-bottom-rule', .349, .627, .554, .001, ink),
        text('medium', '媒介：光、时间与生活', .349, .645, .52, 21, ink, { fontFamily: chineseFonts.serif }),
        text('collection', '生活切片 / 留住平凡之中的动人', .349, .681, .53, 17, ink),
      ];
    },
  },
  {
    key: 'field-notes',
    name: '出走的一页',
    category: '旅行',
    description: '苔绿野外手记、赭黄路线标记与文楷旁注，记录自己的行走。',
    color: '#34493b',
    frames: (count) => cornerFrames(count, 'bottom-left', .74, .76),
    elements: (_count, id) => {
      const { text, shape } = posterElements(id);
      const top = .24;
      const moss = '#34493b';
      const paper = '#f0ead7';
      const ochre = '#cba44c';
      return [
        shape('notebook-cover', .037, top + .035, .45, .354, moss),
        shape('notebook-spine', .037, top + .035, .011, .354, ochre),
        text('eyebrow', 'FIELD / NOTES', .072, top + .058, .37, 21, ochre, { fontFamily: 'DM Sans Variable' }),
        text('title', '出走\n的一页', .067, top + .104, .385, 85, paper, { fontFamily: chineseFonts.kai, lineHeight: 1.05 }),
        text('cover-caption', '走慢一点，看见更多。', .073, top + .322, .37, 22, paper, { fontFamily: chineseFonts.kai }),
        shape('compass-horizontal', .566, top + .075, .102, .003, paper),
        shape('compass-vertical', .616, top + .036, .003, .08, paper),
        shape('compass-center', .607, top + .068, .02, .016, ochre, { shape: 'circle' }),
        shape('direction-paper', .551, top + .126, .133, .034, moss),
        text('direction', '向远处', .558, top + .131, .12, 18, paper, { align: 'center', fontFamily: chineseFonts.kai }),
        shape('route-paper', .037, top + .555, .65, .164, paper),
        text('route-label', '沿途手记', .065, top + .574, .25, 25, moss, { fontFamily: chineseFonts.kai }),
        text('route-count', 'TRAVEL FRAGMENTS', .349, top + .579, .3, 17, moss, { fontFamily: 'DM Sans Variable', align: 'right' }),
        shape('route-line', .083, top + .633, .513, .002, moss),
        ...[.083, .338, .593].map((x, index) => shape(`route-point-${index}`, x - .006, top + .629, .013, .0104, ochre, { shape: 'circle' })),
        text('route-start', '出发', .064, top + .65, .16, 22, moss, { fontFamily: chineseFonts.kai }),
        text('route-pause', '停留', .307, top + .65, .16, 22, moss, { fontFamily: chineseFonts.kai }),
        text('route-next', '继续走', .53, top + .65, .13, 22, moss, { fontFamily: chineseFonts.kai }),
      ];
    },
  },
  {
    key: 'coast-letter',
    name: '海风来信',
    category: '旅行',
    description: '钴蓝海岸特辑，用英文大字、中文宋体和邮戳几何留住海风。',
    color: '#f5efdb',
    frames: (count) => edgeFrames(count, 'bottom', .7),
    elements: (_count, id) => {
      const { text, shape } = posterElements(id);
      const blue = '#1745b2';
      const cream = '#f5efdb';
      return [
        shape('coast-tag-paper', .045, .346, .345, .058, cream),
        text('coast-tag', 'COASTAL / 海岸手札', .064, .363, .305, 19, blue, { fontStyle: 'bold' }),
        shape('letter-paper', .045, .538, .574, .405, cream),
        text('english-title', 'SEA\nLETTER', .073, .554, .52, 104, blue, { fontFamily: 'DM Sans Variable', fontStyle: 'bold', lineHeight: .92 }),
        shape('horizon-rule', .078, .724, .49, .005, blue),
        text('title', '海风来信', .075, .755, .49, 61, blue, { fontFamily: chineseFonts.serif }),
        text('letter-note', '把远方的蓝，寄给此刻。', .08, .853, .47, 24, blue, { fontFamily: chineseFonts.serif }),
        text('letter-footer', 'FROM THE SEA / 写在海边', .08, .908, .48, 17, blue),
        shape('postmark-paper', .762, .352, .15, .12, cream, { shape: 'circle' }),
        shape('postmark-ring', .771, .3592, .132, .1056, 'transparent', { shape: 'circle', stroke: blue, strokeWidth: 2 }),
        text('postmark', '寄给\n下一站', .779, .379, .116, 22, blue, { align: 'center', fontFamily: chineseFonts.serif, lineHeight: 1.2 }),
        ...[.0, .025, .05].map((offset, index) => shape(`horizon-${index}`, .703, .852 + offset, .245 - index * .035, .007, cream)),
      ];
    },
  },
  {
    key: 'daily-headline',
    name: '今天，值得头条',
    category: '杂志',
    description: '暖新闻纸、黑红编排与双栏短笺，把生活写成自己的头条。',
    color: '#f1e7d2',
    frames: (count) => edgeFrames(count, 'right', .74),
    elements: (_count, id) => {
      const { text, shape } = posterElements(id);
      const paper = '#f1e7d2';
      const ink = '#24231f';
      const red = '#a93429';
      return [
        shape('masthead-paper', .299, .04, .66, .31, paper),
        text('masthead', '日常特写', .325, .057, .35, 30, ink, { fontFamily: chineseFonts.serif, fontStyle: 'bold' }),
        text('masthead-english', 'LIFE / IN FOCUS', .648, .065, .283, 18, ink, { fontFamily: 'DM Sans Variable', align: 'right' }),
        shape('masthead-rule', .326, .1, .606, .003, ink),
        shape('masthead-fine-rule', .326, .108, .606, .001, ink),
        text('title', '今天，\n值得头条', .324, .126, .59, 69, ink, { fontFamily: chineseFonts.serif, fontStyle: 'bold', lineHeight: 1.08 }),
        shape('headline-accent', .326, .271, .105, .007, red),
        text('subhead', '小事，也有被看见的分量。', .326, .301, .58, 23, red, { fontFamily: chineseFonts.serif }),
        shape('columns-paper', .299, .776, .66, .185, paper),
        shape('columns-top-rule', .323, .794, .612, .003, ink),
        text('column-one-label', '今日看点', .325, .812, .277, 23, red, { fontStyle: 'bold' }),
        text('column-one', '光落下的地方，\n藏着生活的细节。', .325, .85, .277, 22, ink, { fontFamily: chineseFonts.serif, lineHeight: 1.45 }),
        shape('column-divider', .625, .817, .001, .113, ink),
        text('column-two-label', '留给自己的一页', .651, .812, .282, 23, ink, { fontStyle: 'bold' }),
        text('column-two', '翻开这一页，\n收好今天的心情。', .651, .85, .282, 22, ink, { fontFamily: chineseFonts.serif, lineHeight: 1.45 }),
        shape('columns-bottom-rule', .323, .941, .612, .001, ink),
      ];
    },
  },
  {
    key: 'film-proof',
    name: '未完待续',
    category: '胶片',
    description: '深色模拟胶片样张，以可编辑齿孔、场记和铜色编号衬托影像。',
    color: '#211e1c',
    frames: (count) => edgeFrames(count, 'top', .72),
    elements: (_count, id) => {
      const { text, shape } = posterElements(id);
      const dark = '#211e1c';
      const ivory = '#f1e6cd';
      const copper = '#c18f64';
      return [
        shape('left-film-rail', .022, .024, .035, .674, dark),
        shape('right-film-rail', .943, .024, .035, .674, dark),
        ...Array.from({ length: 8 }, (_, index) => {
          const y = .047 + index * .081;
          return [
            shape(`left-perforation-${index}`, .03, y, .019, .032, ivory),
            shape(`right-perforation-${index}`, .951, y, .019, .032, ivory),
          ];
        }).flat(),
        shape('slate-paper', .085, .041, .426, .119, dark),
        shape('slate-top-rule', .103, .058, .389, .004, copper),
        text('slate-label', 'STILL / FRAME 01', .105, .074, .365, 23, ivory, { fontFamily: 'DM Sans Variable', fontStyle: 'bold' }),
        text('slate-count', '静帧留存  /  生活片段', .105, .117, .365, 20, copper),
        shape('title-panel', .085, .473, .829, .213, dark),
        text('proof-label', 'KEEP THE MOMENT', .108, .49, .59, 21, copper, { fontFamily: 'DM Sans Variable' }),
        text('title', '未完待续', .105, .528, .75, 88, ivory, { fontFamily: chineseFonts.display, lineHeight: 1.08 }),
        shape('slate-marker', .838, .497, .049, .008, copper),
        shape('slate-marker-vertical', .879, .497, .008, .039, copper),
        text('closing-note', '故事还在发生，下一格继续。', .11, .641, .72, 22, ivory),
      ];
    },
  },
];
