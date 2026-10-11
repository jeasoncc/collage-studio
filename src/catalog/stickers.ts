// Artwork: Microsoft Fluent Emoji Flat, MIT, distributed by @iconify-json/fluent-emoji-flat.
import iconsUrl from '@iconify-json/fluent-emoji-flat/icons.json?url';
import metadata from '@iconify-json/fluent-emoji-flat/metadata.json';
import { getIconData } from '@iconify/utils/lib/icon-set/get-icon';
import { iconToSVG } from '@iconify/utils/lib/svg/build';
import { iconToHTML } from '@iconify/utils/lib/svg/html';
import { replaceIDs } from '@iconify/utils/lib/svg/id';
import type { StickerPreset } from '../types';

const categoryNames: Record<string, string> = {
  'Smileys & Emotion': '表情心情', 'Animals & Nature': '动物自然', 'Food & Drink': '美食饮品',
  Activities: '庆祝运动', 'Travel & Places': '旅行风景', Objects: '生活物件',
  'People & Body': '人物手势', Symbols: '符号装饰', Flags: '旗帜',
};
export const stickerCategories = ['全部', '表情心情', '动物自然', '美食饮品', '庆祝运动', '旅行风景', '生活物件', '人物手势', '符号装饰', '旗帜'];

// Chinese search aliases complement the original English package identifiers.
const words: Record<string, string> = {
  heart: '爱心 心 喜欢 爱情', love: '爱 喜欢', smile: '笑 开心', smiling: '微笑 开心', grinning: '笑脸 开心',
  face: '脸 表情', happy: '开心 快乐', crying: '哭 难过', tear: '泪', tears: '泪', sad: '难过 悲伤',
  laughing: '大笑', wink: '眨眼', winking: '眨眼', kiss: '亲亲', kissing: '亲吻', angry: '生气',
  pouting: '生气 嘟嘴', thinking: '思考', sleepy: '困 睡觉', sleeping: '睡觉', worried: '担心',
  sunglasses: '墨镜 酷', party: '派对 聚会 庆祝', partying: '派对 庆祝', balloon: '气球 生日',
  birthday: '生日', cake: '蛋糕 生日', confetti: '彩纸 庆祝', gift: '礼物', wrapped: '礼物 包装',
  sparkles: '闪光 星光', star: '星星', glowing: '发光', sun: '太阳 阳光', moon: '月亮', rainbow: '彩虹',
  cloud: '云', snow: '雪 冬天', snowflake: '雪花', snowman: '雪人 冬天', fire: '火 热情',
  christmas: '圣诞', tree: '树', evergreen: '松树', deciduous: '树 秋天', flower: '花', blossom: '花朵',
  rose: '玫瑰', tulip: '郁金香', sunflower: '向日葵', cherry: '樱花 樱桃', bouquet: '花束',
  leaf: '叶子', leaves: '树叶', fallen: '落叶 秋天', clover: '四叶草 幸运', cactus: '仙人掌',
  butterfly: '蝴蝶', bee: '蜜蜂', lady: '女士', beetle: '甲虫', bug: '虫', bird: '鸟', dove: '鸽子',
  cat: '猫 猫咪', dog: '狗 小狗', rabbit: '兔子', bear: '熊', teddy: '小熊', panda: '熊猫',
  koala: '考拉', fox: '狐狸', tiger: '老虎', lion: '狮子', monkey: '猴子', pig: '猪', cow: '牛',
  horse: '马', unicorn: '独角兽', elephant: '大象', penguin: '企鹅', chick: '小鸡', chicken: '鸡',
  duck: '鸭子', fish: '鱼', whale: '鲸鱼', dolphin: '海豚', octopus: '章鱼', turtle: '乌龟',
  frog: '青蛙', dragon: '龙', snake: '蛇', paw: '爪印', footprints: '脚印',
  apple: '苹果', banana: '香蕉', strawberry: '草莓', peach: '桃子', orange: '橙色 橙子', lemon: '柠檬',
  watermelon: '西瓜', grape: '葡萄', grapes: '葡萄', avocado: '牛油果', carrot: '胡萝卜', corn: '玉米',
  bread: '面包', croissant: '牛角包', pizza: '披萨', hamburger: '汉堡', fries: '薯条',
  sushi: '寿司', rice: '米饭', noodle: '面条', spaghetti: '意面', dumpling: '饺子', egg: '鸡蛋',
  cheese: '奶酪', chocolate: '巧克力', candy: '糖果', lollipop: '棒棒糖', cookie: '饼干',
  doughnut: '甜甜圈', cream: '冰淇淋', cupcake: '纸杯蛋糕', pie: '派', pudding: '布丁',
  coffee: '咖啡', beverage: '饮料', tea: '茶', cup: '杯', milk: '牛奶', bottle: '瓶',
  beer: '啤酒', wine: '葡萄酒', cocktail: '鸡尾酒', drink: '饮料', bubble: '泡泡 奶茶',
  airplane: '飞机', rocket: '火箭', car: '汽车', bus: '巴士', train: '火车', bicycle: '自行车',
  sailboat: '帆船', ship: '船', beach: '海滩 夏天', island: '岛', mountain: '山', camping: '露营',
  tent: '帐篷 露营', house: '家 房子', building: '建筑', city: '城市', castle: '城堡', bridge: '桥',
  globe: '地球 世界', map: '地图', compass: '指南针', luggage: '行李', ticket: '票', passport: '护照',
  camera: '相机 摄影', picture: '照片', film: '胶片', book: '书', pencil: '铅笔', pen: '笔',
  paint: '画画', palette: '调色板', music: '音乐', musical: '音乐', note: '音符 便笺',
  guitar: '吉他', piano: '钢琴', headphones: '耳机', microphone: '麦克风', phone: '手机 电话',
  computer: '电脑', laptop: '笔记本电脑', light: '灯 浅肤色', bulb: '灯泡 灵感', candle: '蜡烛',
  clock: '时钟', hourglass: '沙漏', calendar: '日历', envelope: '信封', letter: '信',
  ribbon: '丝带', bow: '蝴蝶结', crown: '皇冠', ring: '戒指', gem: '宝石', diamond: '钻石',
  ball: '球', soccer: '足球', basketball: '篮球', tennis: '网球', medal: '奖牌', trophy: '奖杯',
  flag: '旗帜', check: '对勾', cross: '叉', warning: '警告', arrow: '箭头', infinity: '无限',
  red: '红色', pink: '粉色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色',
  black: '黑色', white: '白色', brown: '棕色', hand: '手', hands: '双手', waving: '挥手',
  thumbs: '拇指 点赞', clapping: '鼓掌', victory: '胜利 耶', folded: '合十 祈祷', pointing: '指向',
  person: '人物', woman: '女人 女生', man: '男人 男生', child: '孩子', baby: '宝宝', family: '家庭',
  couple: '情侣', dancing: '跳舞', running: '跑步', walking: '散步', swimming: '游泳',
  dark: '深肤色', medium: '中等肤色',
};
const titles: Record<string, string> = {
  'red-heart': '红色爱心', 'pink-heart': '粉色爱心', 'sparkles': '闪闪发光', 'party-popper': '派对礼炮',
  'birthday-cake': '生日蛋糕', 'hot-beverage': '热咖啡', 'bubble-tea': '珍珠奶茶', 'four-leaf-clover': '幸运四叶草',
  'cherry-blossom': '樱花', 'sun-with-face': '笑脸太阳', 'smiling-face-with-hearts': '心动笑脸',
  'thumbs-up': '点赞', 'folded-hands': '合十祝福', 'camera-with-flash': '闪光相机', 'rainbow': '彩虹',
  'teddy-bear': '玩具小熊', 'wrapped-gift': '惊喜礼物', 'balloon': '气球', 'christmas-tree': '圣诞树',
};
const svgCache = new Map<string, string>();
const searchable: Array<{ sticker: StickerPreset; keywords: string }> = [];
let catalogPromise: Promise<void> | null = null;
export function loadStickerCatalog(): Promise<void> {
  if (!catalogPromise) catalogPromise = (async () => {
    const response = await fetch(iconsUrl);
    if (!response.ok) throw new Error(`贴纸素材读取失败（HTTP ${response.status}）。`);
    const icons = await response.json() as Parameters<typeof getIconData>[0];
    for (const [sourceCategory, names] of Object.entries(metadata.categories)) {
      const category = categoryNames[sourceCategory] ?? '符号装饰';
      for (const id of names) {
        const data = getIconData(icons, id);
        if (!data) continue;
        const localized = id.split('-').map(word => words[word] ?? '').filter(Boolean).join(' ');
        const name = titles[id] ?? `${localized.split(' ').filter(Boolean).slice(0, 3).join(' · ') || category} / ${id.replaceAll('-', ' ')}`;
        const sticker: StickerPreset = {
          id: `fluent-${id}`, name, category,
          get svg() {
            const cached = svgCache.get(id);
            if (cached) return cached;
            const rendered = iconToSVG(data, { width: 128, height: 128 });
            const svg = iconToHTML(replaceIDs(rendered.body), rendered.attributes);
            svgCache.set(id, svg);
            return svg;
          },
        };
        searchable.push({ sticker, keywords: `${id} ${id.replaceAll('-', ' ')} ${name} ${localized} ${category}`.toLowerCase() });
      }
    }
  })().catch(error => { searchable.length = 0; catalogPromise = null; throw error; });
  return catalogPromise;
}

export function getStickers(query = '', category = '全部'): StickerPreset[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return searchable.filter(({ sticker, keywords }) =>
    (!category || category === '全部' || sticker.category === category) && terms.every(term => keywords.includes(term)),
  ).map(({ sticker }) => sticker);
}

export function stickerToBlob(sticker: StickerPreset): Blob {
  return new Blob([sticker.svg], { type: 'image/svg+xml;charset=utf-8' });
}
