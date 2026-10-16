import { chineseFonts } from './photoText';
import { cornerFrames, edgeFrames, posterElements, type PosterDesign } from './posterDesign';

export const lifestylePosterDesigns: readonly PosterDesign[] = [
  {
    key: 'live-session',
    name: '此刻，正热烈',
    category: '应援',
    description: '酸绿与墨黑的现场音乐海报，叠字标题搭配节奏条。',
    color: '#ceff3b',
    frames: count => edgeFrames(count, 'right', .74),
    elements(_count, id) {
      const { text, shape } = posterElements(id);
      const ink = '#111812';
      const lime = '#ceff3b';
      return [
        shape('session-label', .30, .045, .48, .058, ink),
        text('session', 'LIVE / SESSION', .322, .058, .44, 32, lime, { fontFamily: 'DM Sans Variable', fontStyle: 'bold' }),
        shape('pulse-1', .81, .051, .018, .036, lime),
        shape('pulse-2', .84, .038, .018, .062, lime),
        shape('pulse-3', .87, .056, .018, .027, lime),
        shape('pulse-4', .90, .043, .018, .052, lime),
        shape('pulse-5', .93, .060, .018, .019, lime),
        shape('title-ground', .30, .505, .66, .455, ink),
        text('eyebrow', '把心跳，交给现场', .337, .532, .57, 26, '#ffffff'),
        text('title', '此刻，\n正热烈', .33, .584, .59, 112, lime, { fontFamily: chineseFonts.display, fontStyle: 'bold', lineHeight: 1.05 }),
        shape('title-rule', .337, .797, .55, .003, lime),
        text('chant', '同频 · 共振 · 尽情热爱', .337, .823, .55, 27, '#ffffff', { fontStyle: 'bold' }),
        text('caption', '让这一瞬，久久回响。', .337, .879, .55, 25, '#dce4d5'),
        shape('beat-1', .907, .820, .018, .023, lime),
        shape('beat-2', .907, .853, .018, .039, lime),
        shape('beat-3', .907, .902, .018, .026, lime),
      ];
    },
  },
  {
    key: 'match-day',
    name: '热爱，永不散场',
    category: '运动',
    description: '钴蓝运动封面，橙色速度斜线与记分牌式热爱宣言。',
    color: '#1245d8',
    frames: count => edgeFrames(count, 'left', .72),
    elements(_count, id) {
      const { text, shape } = posterElements(id);
      const blue = '#1245d8';
      const orange = '#ff733b';
      return [
        shape('heading-ground', 0, 0, .72, .295, blue),
        text('heading', 'MATCH DAY', .04, .027, .61, 33, '#ffffff', { fontFamily: 'DM Sans Variable', fontStyle: 'bold' }),
        shape('heading-line', .04, .071, .61, .003, '#ffffff'),
        text('title', '热爱，\n永不散场', .035, .09, .65, 91, '#ffffff', { fontFamily: chineseFonts.display, fontStyle: 'bold', lineHeight: 1.05 }),
        shape('scoreboard', .035, .765, .395, .185, blue),
        text('scoreboard-label', '热爱状态', .055, .782, .35, 23, '#ffffff'),
        text('scoreboard-on', 'ALL IN', .05, .819, .36, 72, '#ffffff', { fontFamily: 'DM Sans Variable', fontStyle: 'bold', lineHeight: 1 }),
        shape('scoreboard-rule', .055, .889, .335, .002, orange),
        text('scoreboard-caption', '每一刻，都全力以赴', .055, .910, .34, 21, '#ffffff'),
        shape('speed-1', .475, .800, .031, .113, orange, { rotation: -22 }),
        shape('speed-2', .545, .800, .031, .113, '#ffffff', { rotation: -22 }),
        shape('speed-3', .615, .800, .031, .113, orange, { rotation: -22 }),
        shape('sideline', .04, .328, .008, .17, orange),
      ];
    },
  },
  {
    key: 'birthday-pop',
    name: '快乐，今天加倍',
    category: '生日',
    description: '橘子汽水色生日海报，奶油黄大标题、星星纸屑与礼物吊牌。',
    color: '#ff6b2b',
    frames: count => edgeFrames(count, 'top', .74),
    elements(_count, id) {
      const { text, shape } = posterElements(id);
      const orange = '#d84316';
      const butter = '#fff0a6';
      return [
        shape('title-paper', .035, .035, .65, .315, butter),
        text('eyebrow', 'HAPPY BIRTHDAY', .068, .058, .56, 27, orange, { fontFamily: 'DM Sans Variable', fontStyle: 'bold' }),
        text('title', '快乐，\n今天加倍', .063, .108, .59, 104, orange, { fontStyle: 'bold', lineHeight: 1.06 }),
        shape('large-star', .775, .058, .15, .12, butter, { shape: 'star', rotation: 13 }),
        shape('confetti-circle', .743, .255, .038, .0304, '#ff6b2b', { shape: 'circle' }),
        shape('confetti-stripe', .886, .285, .021, .065, butter, { rotation: 24 }),
        shape('confetti-small-star', .705, .365, .057, .0456, butter, { shape: 'star', rotation: -13 }),
        shape('gift-tag', .765, .425, .19, .175, butter),
        shape('gift-hole', .841, .442, .028, .0224, orange, { shape: 'circle' }),
        shape('gift-string', .851, .390, .006, .051, butter),
        text('gift-message', 'FOR\nYOU', .785, .477, .15, 37, orange, { fontFamily: 'DM Sans Variable', fontStyle: 'bold', align: 'center', lineHeight: 1.05 }),
        shape('wish-ribbon', .035, .628, .92, .077, '#ff6b2b'),
        text('wish', '愿你被爱包围，也永远尽兴。', .062, .646, .86, 31, '#fffbea', { fontStyle: 'bold' }),
        shape('ribbon-star', .876, .647, .039, .0312, butter, { shape: 'star' }),
      ];
    },
  },
  {
    key: 'love-vows',
    name: '以爱，为名',
    category: '纪念',
    description: '暖象牙白与酒红的亲密纪念请柬，衬线连字、细线与留白。',
    color: '#f7efdf',
    frames: count => cornerFrames(count, 'top-left', .74, .76),
    elements(_count, id) {
      const { text, shape } = posterElements(id);
      const ivory = '#fbf4e6';
      const wine = '#702a3e';
      return [
        shape('invitation-paper', .035, .035, .40, .635, ivory),
        text('eyebrow', 'TOGETHER', .07, .055, .33, 22, wine, { fontFamily: 'DM Sans Variable', align: 'center' }),
        text('ampersand', '&', .077, .097, .316, 183, wine, { fontFamily: 'Playfair Display', align: 'center', lineHeight: 1 }),
        shape('fine-rule', .085, .291, .30, .0012, wine),
        text('title', '以爱，\n为名', .074, .326, .33, 77, wine, { fontFamily: chineseFonts.serif, lineHeight: 1.22 }),
        shape('small-rule', .078, .503, .075, .0012, wine),
        text('intimate-copy', '把寻常的日子，\n过成彼此的珍藏。', .075, .536, .33, 24, wine, { fontFamily: chineseFonts.fangsong, lineHeight: 1.7 }),
        shape('paired-label', .485, .674, .215, .048, wine),
        text('paired-copy', 'YOU & ME', .495, .683, .195, 22, ivory, { fontFamily: 'Playfair Display', align: 'center' }),
      ];
    },
  },
  {
    key: 'coffee-day',
    name: '今日，有点香',
    category: '生活',
    description: '浓缩咖啡色的日常手账，以菜单层级、收据细节与杯子图形留住香气。',
    color: '#f6ecd8',
    frames: count => edgeFrames(count, 'bottom', .72),
    elements(_count, id) {
      const { text, shape } = posterElements(id);
      const cream = '#fff4df';
      const espresso = '#462d23';
      return [
        shape('receipt-paper', .53, .33, .43, .61, cream),
        text('menu-heading', 'THE DAILY CUP', .567, .358, .35, 25, espresso, { fontFamily: 'DM Sans Variable', fontStyle: 'bold', align: 'center' }),
        shape('receipt-rule', .565, .402, .36, .002, espresso),
        text('title', '今日，\n有点香', .567, .430, .36, 77, espresso, { fontFamily: chineseFonts.serif, fontStyle: 'bold', lineHeight: 1.12 }),
        text('menu-line', '今日特调：放慢一点', .568, .589, .355, 24, espresso),
        shape('handle', .710, .694, .060, .048, 'transparent', { shape: 'circle', stroke: espresso, strokeWidth: 5 }),
        shape('cup', .59, .683, .135, .078, espresso),
        shape('saucer', .574, .772, .174, .006, espresso),
        shape('steam-left', .613, .641, .004, .025, espresso, { rotation: -12 }),
        shape('steam-middle', .653, .630, .004, .035, espresso, { rotation: 12 }),
        shape('steam-right', .691, .641, .004, .025, espresso, { rotation: -12 }),
        text('cup-note', '慢慢喝', .784, .702, .13, 25, espresso, { fontFamily: chineseFonts.kai }),
        ...Array.from({ length: 12 }, (_, index) => shape(`receipt-dash-${index}`, .566 + index * .03, .805, .016, .0015, espresso)),
        text('journal-copy', '一杯日常，一点松弛。\n让生活回到喜欢的温度。', .567, .832, .36, 23, espresso, { lineHeight: 1.6 }),
        ...Array.from({ length: 11 }, (_, index) => shape(`receipt-tooth-${index}`, .53 + index * .039, .937, .039, .012, cream, { shape: 'star' })),
      ];
    },
  },
  {
    key: 'little-companion',
    name: '和你的小日子',
    category: '生活',
    description: '蜜桃与钴蓝的陪伴手账，手写小句与可编辑几何爪印。',
    color: '#ffd5bc',
    frames: count => cornerFrames(count, 'top-left', .74, .76),
    elements(_count, id) {
      const { text, shape } = posterElements(id);
      const peach = '#ffd5bc';
      const blue = '#2346bb';
      return [
        shape('note-paper', .04, .045, .345, .112, '#fff6dc'),
        text('handwritten-note', '有你在，\n平凡也可爱', .062, .057, .30, 31, blue, { fontFamily: chineseFonts.kai, lineHeight: 1.35 }),
        shape('paw-badge', .505, .045, .19, .152, peach, { shape: 'circle' }),
        shape('paw-pad', .560, .120, .080, .044, blue, { shape: 'circle' }),
        shape('paw-toe-1', .537, .091, .028, .030, blue, { shape: 'circle', rotation: -20 }),
        shape('paw-toe-2', .576, .070, .028, .032, blue, { shape: 'circle', rotation: -8 }),
        shape('paw-toe-3', .616, .073, .028, .032, blue, { shape: 'circle', rotation: 9 }),
        shape('paw-toe-4', .650, .100, .028, .028, blue, { shape: 'circle', rotation: 23 }),
        shape('journal-band', 0, .50, .74, .26, peach),
        text('handwriting', 'my little joy', .045, .510, .55, 39, blue, { fontFamily: 'Caveat', lineHeight: 1 }),
        text('title', '和你的小日子', .041, .563, .66, 82, blue, { fontStyle: 'bold', lineHeight: 1.1 }),
        shape('journal-rule', .046, .648, .645, .002, blue),
        text('affectionate-copy', '一起散步，一起发呆。\n小小日常，因为有你而闪光。', .046, .672, .65, 26, blue, { fontFamily: chineseFonts.kai, lineHeight: 1.5 }),
      ];
    },
  },
];
