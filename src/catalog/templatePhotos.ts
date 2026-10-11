import photo10 from '../assets/template-photos/10.webp';
import photo11 from '../assets/template-photos/11.webp';
import photo13 from '../assets/template-photos/13.webp';
import photo15 from '../assets/template-photos/15.webp';
import photo29 from '../assets/template-photos/29.webp';
import photo30 from '../assets/template-photos/30.webp';
import photo39 from '../assets/template-photos/39.webp';
import photo42 from '../assets/template-photos/42.webp';
import photo96 from '../assets/template-photos/96.webp';
import photo25 from '../assets/template-photos/25.webp';
import photo82 from '../assets/template-photos/82.webp';
import photo43 from '../assets/template-photos/43.webp';
import photo49 from '../assets/template-photos/49.webp';
import photo57 from '../assets/template-photos/57.webp';
import photo58 from '../assets/template-photos/58.webp';
import photo45 from '../assets/template-photos/45.webp';
import photo50 from '../assets/template-photos/50.webp';
import photo76 from '../assets/template-photos/76.webp';
import photo77 from '../assets/template-photos/77.webp';
import photo59 from '../assets/template-photos/59.webp';

export interface TemplatePhoto {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  author: string;
  source: string;
  metadata: string;
  originalWidth: number;
  originalHeight: number;
}

export const templatePhotoLicense = {
  name: 'Unsplash License',
  url: 'https://unsplash.com/license',
  usagePermission: 'https://help.unsplash.com/en/articles/2612315-can-i-use-unsplash-images-for-personal-or-commercial-projects',
  metadataVerifiedAt: '2026-10-10',
} as const;

// Unsplash photographs, primary author/source metadata from the stable Picsum info API.
// Bundled WebP derivatives retain each original's aspect ratio; no remote image requests.
export const templatePhotos: readonly TemplatePhoto[] = [
  { id: '10', name: '山间远眺', url: photo10, width: 960, height: 640, author: "Paul Jarvis", source: 'https://unsplash.com/photos/6J--NXulQCs', metadata: 'https://picsum.photos/id/10/info', originalWidth: 2500, originalHeight: 1667 },
  { id: '11', name: '雾中河谷', url: photo11, width: 960, height: 640, author: "Paul Jarvis", source: 'https://unsplash.com/photos/Cm7oKel-X2Q', metadata: 'https://picsum.photos/id/11/info', originalWidth: 2500, originalHeight: 1667 },
  { id: '13', name: '静谧海岸', url: photo13, width: 960, height: 640, author: "Paul Jarvis", source: 'https://unsplash.com/photos/3MtiSMdnoCo', metadata: 'https://picsum.photos/id/13/info', originalWidth: 2500, originalHeight: 1667 },
  { id: '15', name: '山林瀑布', url: photo15, width: 960, height: 640, author: "Paul Jarvis", source: 'https://unsplash.com/photos/NYDo21ssGao', metadata: 'https://picsum.photos/id/15/info', originalWidth: 2500, originalHeight: 1667 },
  { id: '29', name: '雪山远行', url: photo29, width: 960, height: 641, author: "Go Wild", source: 'https://unsplash.com/photos/V0yAek6BgGk', metadata: 'https://picsum.photos/id/29/info', originalWidth: 4000, originalHeight: 2670 },
  { id: '30', name: '一杯暖意', url: photo30, width: 960, height: 676, author: "Shyamanta Baruah", source: 'https://unsplash.com/photos/aeVA-j1y2BY', metadata: 'https://picsum.photos/id/30/info', originalWidth: 1280, originalHeight: 901 },
  { id: '39', name: '唱片时光', url: photo39, width: 960, height: 640, author: "Luke Chesser", source: 'https://unsplash.com/photos/pFqrYbhIAXs', metadata: 'https://picsum.photos/id/39/info', originalWidth: 3456, originalHeight: 2304 },
  { id: '42', name: '街角咖啡', url: photo42, width: 960, height: 640, author: "Luke Chesser", source: 'https://unsplash.com/photos/KR2mdHJ5qMg', metadata: 'https://picsum.photos/id/42/info', originalWidth: 3456, originalHeight: 2304 },
  { id: '96', name: '镜头日常', url: photo96, width: 960, height: 640, author: "Pawel Kadysz", source: 'https://unsplash.com/photos/CuFYW1c97w8', metadata: 'https://picsum.photos/id/96/info', originalWidth: 4752, originalHeight: 3168 },
  { id: '25', name: '枝间晨光', url: photo25, width: 960, height: 640, author: "Alejandro Escamilla", source: 'https://unsplash.com/photos/Iuq0EL4EINY', metadata: 'https://picsum.photos/id/25/info', originalWidth: 5000, originalHeight: 3333 },
  { id: '82', name: '花开小记', url: photo82, width: 960, height: 638, author: "Rula Sibai", source: 'https://unsplash.com/photos/-vq7mi4oF0s', metadata: 'https://picsum.photos/id/82/info', originalWidth: 1500, originalHeight: 997 },
  { id: '43', name: '城市夜桥', url: photo43, width: 960, height: 623, author: "Oleg Chursin", source: 'https://unsplash.com/photos/IoCWq07GaG4', metadata: 'https://picsum.photos/id/43/info', originalWidth: 1280, originalHeight: 831 },
  { id: '49', name: '白色海城', url: photo49, width: 960, height: 594, author: "Margaret Barley", source: 'https://unsplash.com/photos/Qo51KwK1dKg', metadata: 'https://picsum.photos/id/49/info', originalWidth: 1280, originalHeight: 792 },
  { id: '57', name: '城市街道', url: photo57, width: 720, height: 960, author: "Nicholas Swanson", source: 'https://unsplash.com/photos/SyBYM8R6VU4', metadata: 'https://picsum.photos/id/57/info', originalWidth: 2448, originalHeight: 3264 },
  { id: '58', name: '海边灯塔', url: photo58, width: 960, height: 640, author: "Tony Naccarato", source: 'https://unsplash.com/photos/-kEr-QltARg', metadata: 'https://picsum.photos/id/58/info', originalWidth: 1280, originalHeight: 853 },
  { id: '45', name: '异国街行', url: photo45, width: 960, height: 539, author: "Alan Haverty", source: 'https://unsplash.com/photos/-XA-fTYYfV0', metadata: 'https://picsum.photos/id/45/info', originalWidth: 4592, originalHeight: 2576 },
  { id: '50', name: '水上旅程', url: photo50, width: 960, height: 640, author: "Tyler Wanlass", source: 'https://unsplash.com/photos/L7MpmBGpM94', metadata: 'https://picsum.photos/id/50/info', originalWidth: 4608, originalHeight: 3072 },
  { id: '76', name: '木屋单车', url: photo76, width: 960, height: 638, author: "Alexander Shustov", source: 'https://unsplash.com/photos/OxzhYtL-00Y', metadata: 'https://picsum.photos/id/76/info', originalWidth: 4912, originalHeight: 3264 },
  { id: '77', name: '通往海的栈桥', url: photo77, width: 960, height: 649, author: "May Pamintuan", source: 'https://unsplash.com/photos/j9nfqTi5T5o', metadata: 'https://picsum.photos/id/77/info', originalWidth: 1631, originalHeight: 1102 },
  { id: '59', name: '秋日篱笆', url: photo59, width: 960, height: 636, author: "Art Wave", source: 'https://unsplash.com/photos/algEQavPY4M', metadata: 'https://picsum.photos/id/59/info', originalWidth: 2464, originalHeight: 1632 },
];

const collections: Record<string, readonly string[]> = {
  极简: ['42', '13', '25', '30', '76', '11'],
  胶片: ['43', '57', '58', '50', '45', '39'],
  拍立得: ['30', '42', '76', '82', '39', '77'],
  手帐: ['82', '25', '59', '76', '30', '11'],
  生日: ['82', '30', '42', '25', '39', '76'],
  旅行: ['49', '57', '50', '45', '77', '29', '10', '15'],
  节日: ['59', '11', '30', '82', '76', '13'],
  杂志: ['57', '42', '43', '76', '39', '96'],
  动态: ['13', '82', '25', '77', '50', '10'],
  照片集: ['49', '57', '77', '42', '11', '82', '50', '76'],
};
const photosById: Record<string, TemplatePhoto> = Object.fromEntries(templatePhotos.map(photo => [photo.id, photo]));

export function photosForTemplate(template: { id: string; category: string }, count: number): TemplatePhoto[] {
  const preferred = collections[template.category] ?? templatePhotos.map(photo => photo.id);
  // A stable per-template offset varies the lead photograph without reshuffling on renders.
  let hash = 0;
  for (const character of template.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const offset = hash % preferred.length;
  const ordered = [...preferred.slice(offset), ...preferred.slice(0, offset)];
  const ids = [...new Set([...ordered, ...templatePhotos.map(photo => photo.id)])];
  // Every position receives a distinct photo, including twenty-photo contact sheets.
  return ids.slice(0, count).map(id => photosById[id]!);
}
