<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Konva from 'konva';
import { createPhotoFrame, slotRect } from '../defaults';
import type { CropChange, CropState, DrawingChange, EditorCanvasHandle, EditorDocument, FilterState, ImageElement, MediaAsset, SceneElement, Selection, TransformChange } from '../types';
import { animationAt, curvedTextPath, imageGeometry, shapePath } from './canvasGeometry';
import { filmPerforationPath, photoFrameGeometry } from './photoFrameGeometry';
import { measureTextHeight, textFrameHeight, textNodeConfig, textPadding } from './textLayout';
import { loadCanvasMedia, refreshMediaCache, seekVideo } from './canvasMedia';
import type { CanvasMedia } from './canvasMedia';
import { getAnimatedFrame, imagePreviewSource, resizeAssetImage } from '../services/media';
import { ensureSceneFonts } from '../services/fonts';

const props = withDefaults(defineProps<{
  document: EditorDocument;
  assets: Record<string, MediaAsset>;
  selection?: Selection;
  tool?: 'select' | 'draw' | 'erase';
  brushColor?: string;
  brushSize?: number;
  brushOpacity?: number;
  cropMode?: boolean;
  inlineCropMode?: boolean;
  inlineDisabled?: boolean;
  playing?: boolean;
}>(), { selection: null, tool: 'select', brushColor: '#30343b', brushSize: 12, brushOpacity: 1, cropMode: false, inlineCropMode: false, inlineDisabled: false, playing: false });
const emit = defineEmits<{
  select: [selection: Selection]; transform: [change: TransformChange]; crop: [change: CropChange];
  draw: [change: DrawingChange]; requestAsset: [slotId: string]; editText: [elementId: string]; error: [message: string];
  inlineStart: [selection: NonNullable<Selection>]; inlineEnd: [result: { cancelled: boolean }];
}>();

const host = ref<HTMLDivElement>();
const plainFrame = createPhotoFrame();
const stageRef = ref<{ getNode: () => Konva.Stage }>();
const viewport = ref({ width: 320, height: 320, scale: 320 / 1080 });
const stageConfig = computed(() => ({ width: viewport.value.width, height: viewport.value.height, scaleX: viewport.value.scale, scaleY: viewport.value.scale }));
let stage: Konva.Stage | undefined;
let layer: Konva.Layer | undefined;
let root: Konva.Group | undefined;
let gizmos: Konva.Group | undefined;
let transformer: Konva.Transformer | undefined;
let selectionOutline: Konva.Rect | undefined;
let patternNode: Konva.Group | undefined;
let resizeObserver: ResizeObserver | undefined;
let buildGeneration = 0;
let buildPromise: Promise<void> = Promise.resolve();
let mounted = false;
let exporting = false;
let interaction = false;
let pendingBuild = false;
let raf = 0;
let clockStart = 0;
let previewTime = 0;
let exportQueue: Promise<unknown> = Promise.resolve();
let liveFramePromise: Promise<void> = Promise.resolve();
const resources = new Map<string, CanvasMedia>();
const elementNodes = new Map<string, Konva.Group>();
const placeholderNodes: Konva.Node[] = [];
interface VideoBinding { video: HTMLVideoElement; image: Konva.Image; start: number; end: number; muted: boolean; playBlocked?: boolean; playPending?: boolean }
const videos: VideoBinding[] = [];
const animatedAssets = new Map<string, MediaAsset>();
interface PictureBinding { asset: MediaAsset; image: Konva.Image; source: CanvasMedia['source']; blur: number }
const pictures: PictureBinding[] = [];
const animatedBindings: { assetId: string; image: Konva.Image }[] = [];
const pointers = new Map<number, { x: number; y: number }>();
type Point = { x: number; y: number };
interface CropSource {
  crop: CropState; width: number; height: number; rotation: number; center: Point;
  asset: MediaAsset; node: Konva.Group; image: Konva.Image;
}
let cropGesture: {
  selection: NonNullable<Selection>; source: CropSource; crop: CropState; latest: CropState;
  start: Point; distance: number; inline: boolean;
} | undefined;
let hold: { pointerId: number; selection: NonNullable<Selection>; screen: Point; timer: ReturnType<typeof setTimeout> } | undefined;
const inlineActive = ref(false);
let suppressTapUntil = 0;
const compatibilityEvents = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick'] as const;
let drawing: { points: number[]; line: Konva.Line; tool: DrawingChange['tool'] } | undefined;

function resize() {
  if (!host.value || exporting) return;
  const width = Math.max(1, host.value.clientWidth);
  const availableHeight = Math.max(1, host.value.clientHeight || window.innerHeight * .66);
  const scale = Math.min(width / props.document.width, availableHeight / props.document.height);
  viewport.value = { width: props.document.width * scale, height: props.document.height * scale, scale };
  updateSelection();
}

function resizeForViewport() {
  const previousScale = viewport.value.scale;
  resize();
  if (viewport.value.scale !== previousScale) scheduleBuild();
}

function acquire(key: string, assetId: string, active: Set<string>) {
  const asset = props.assets[assetId];
  if (!asset || asset.kind === 'audio') return undefined;
  active.add(key);
  let media = resources.get(key);
  if (!media || media.src !== imagePreviewSource(asset)) {
    media?.dispose();
    media = loadCanvasMedia(asset);
    // All decode failures are surfaced; renderFrame also rejects instead of exporting a missing photo.
    void media.ready.catch(error => emit('error', error instanceof Error ? error.message : '素材读取失败。'));
    resources.set(key, media);
  }
  return media;
}

function cachePicture(binding: PictureBinding, pixelRatio: number) {
  const { image } = binding;
  if (!image.filters()?.length) return;
  const ratio = Math.max(1 / Math.min(image.width(), image.height()), Math.min(1, pixelRatio));
  image.clearCache();
  image.blurRadius(binding.blur * ratio);
  image.cache({ x: 0, y: 0, width: image.width(), height: image.height(), pixelRatio: ratio, hitCanvasPixelRatio: ratio });
}

function addPicture(parent: Konva.Group, key: string, assetId: string, width: number, height: number, crop: CropState, filter: FilterState, options?: Partial<ImageElement>) {
  const resource = resources.get(key);
  const asset = props.assets[assetId];
  if (!resource || !asset) return;
  if (resource.source instanceof HTMLImageElement && !resource.source.naturalWidth) return;
  if (resource.source instanceof HTMLVideoElement && resource.source.readyState < 2) return;
  const shape = options?.shape ?? props.document.slots.find(slot => `slot:${slot.id}` === key)?.shape ?? 'rect';
  const treatment = key !== 'background' && asset.kind !== 'sticker' ? props.document.photoFrame : undefined;
  const frame = photoFrameGeometry(width, height, treatment ?? plainFrame, asset.width, asset.height);
  const radius = key === 'background' ? 0 : options?.cornerRadius ?? props.document.cornerRadius;
  const data = shapePath(shape, frame.width, frame.height, Math.max(0, radius - frame.inset));
  const shadow = Math.max(frame.shadow, options?.shadow ?? 0);
  if (treatment && (treatment.kind !== 'none' || shadow)) {
    parent.add(new Konva.Path({ name: 'photo-mat', x: frame.outerX, y: frame.outerY, data: shapePath(treatment.kind === 'none' ? shape : 'rect', frame.outerWidth, frame.outerHeight, radius), fill: treatment.color, shadowColor: '#17211c', shadowBlur: shadow, shadowOffsetY: shadow * .32, shadowOpacity: .22, listening: false }));
    if (treatment.kind === 'film') parent.add(new Konva.Path({ name: 'film-perforations', x: frame.outerX, y: frame.outerY, data: filmPerforationPath(frame.outerWidth, frame.outerHeight, frame.inset), fill: '#d4b47b', opacity: .85, listening: false }));
  }
  const path = new Path2D(data);
  const clipping = new Konva.Group({ x: frame.x, y: frame.y, clipFunc: () => [path], listening: false });
  const geometry = imageGeometry(frame.width, frame.height, asset.width, asset.height, crop);
  const sx = geometry.width / Math.max(1, asset.width), sy = geometry.height / Math.max(1, asset.height);
  const image = new Konva.Image({
    image: resource.source, x: geometry.x, y: geometry.y,
    width: asset.width, height: asset.height, offsetX: asset.width / 2, offsetY: asset.height / 2,
    rotation: geometry.rotation, scaleX: sx * geometry.scaleX, scaleY: sy * geometry.scaleY, listening: false,
  });
  const filters = [];
  if (filter.brightness) filters.push(Konva.Filters.Brighten);
  if (filter.contrast) filters.push(Konva.Filters.Contrast);
  if (filter.saturation) filters.push(Konva.Filters.HSL);
  if (filter.blur) filters.push(Konva.Filters.Blur);
  if (filter.grayscale) filters.push(Konva.Filters.Grayscale);
  if (filter.sepia) filters.push(Konva.Filters.Sepia);
  image.filters(filters).brightness(filter.brightness).contrast(filter.contrast).saturation(filter.saturation);
  clipping.add(image);
  parent.add(clipping);
  const binding: PictureBinding = { asset, image, source: resource.source, blur: filter.blur / Math.max(.001, Math.abs(sx)) };
  pictures.push(binding);
  cachePicture(binding, Math.min(1280 / Math.max(asset.width, asset.height), Math.max(Math.abs(sx), Math.abs(sy)) * viewport.value.scale * (layer?.getCanvas().getPixelRatio() ?? 1)));
  if (!treatment && options?.shadow) {
    const shadow = new Konva.Path({ data, x: frame.x, y: frame.y, fill: '#fff', shadowColor: '#20202d', shadowBlur: options.shadow, shadowOffsetY: options.shadow * .35, shadowOpacity: .26, listening: false });
    parent.add(shadow); shadow.moveToBottom();
  }
  if (options?.borderWidth) parent.add(new Konva.Path({ data, x: frame.x, y: frame.y, stroke: options.borderColor, strokeWidth: options.borderWidth, listening: false }));
  if (resource.source instanceof HTMLVideoElement) {
    const duration = Number.isFinite(resource.source.duration) ? resource.source.duration : asset.duration;
    const start = Math.max(0, Math.min(options?.trimStart ?? 0, Math.max(0, duration - .01)));
    const end = Math.max(start + .01, Math.min(options?.trimEnd ?? duration, duration || .01));
    videos.push({ video: resource.source, image, start, end, muted: options?.muted ?? true });
  }
  if (asset.mime === 'image/gif') {
    animatedAssets.set(asset.id, asset);
    animatedBindings.push({ assetId: asset.id, image });
  }
}

function addBackground() {
  if (!root) return;
  const doc = props.document;
  root.add(new Konva.Rect({ width: doc.width, height: doc.height, fill: doc.background.color, listening: false }));
  if (doc.background.assetId) {
    const group = new Konva.Group({ listening: false });
    addPicture(group, 'background', doc.background.assetId, doc.width, doc.height, { x: 0, y: 0, zoom: 1, rotation: 0, flipX: false, flipY: false }, { brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false, sepia: false });
    root.add(group);
  }
  const pattern = doc.background.pattern;
  if (pattern === 'none') return;
  // Patterns are cached Konva paths rather than a canvas renderer or new bitmap every frame.
  const group = new Konva.Group({ listening: false, clipX: 0, clipY: 0, clipWidth: doc.width, clipHeight: doc.height });
  const spacing = Math.max(20, Math.min(doc.width, doc.height) / 28);
  const color = doc.background.patternColor;
  let data = '';
  if (pattern === 'dots' || pattern === 'paper') {
    const radius = pattern === 'paper' ? .75 : 2;
    for (let y = spacing / 2; y < doc.height; y += spacing) for (let x = spacing / 2; x < doc.width; x += spacing) {
      data += `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 `;
    }
    group.add(new Konva.Path({ data, fill: color, opacity: pattern === 'paper' ? .5 : .7 }));
  } else if (pattern === 'checker') {
    for (let row = 0; row < doc.height / spacing; row++) for (let col = 0; col < doc.width / spacing; col++) if ((row + col) % 2 === 0) {
      data += `M ${col * spacing} ${row * spacing} h ${spacing} v ${spacing} h ${-spacing} Z `;
    }
    group.add(new Konva.Path({ data, fill: color, opacity: .35 }));
  } else {
    for (let x = pattern === 'stripes' ? -doc.height : 0; x < doc.width + doc.height; x += spacing) data += pattern === 'stripes' ? `M ${x} 0 l ${doc.height} ${doc.height} ` : `M ${x} 0 V ${doc.height} `;
    if (pattern === 'grid') for (let y = 0; y < doc.height; y += spacing) data += `M 0 ${y} H ${doc.width} `;
    group.add(new Konva.Path({ data, stroke: color, strokeWidth: pattern === 'stripes' ? 5 : 1, opacity: .4 }));
  }
  root.add(group);
  patternNode = group;
  const ratio = Math.min(1, viewport.value.scale * (layer?.getCanvas().getPixelRatio() ?? 1));
  group.cache({ x: 0, y: 0, width: doc.width, height: doc.height, pixelRatio: ratio, hitCanvasPixelRatio: ratio });
}

// Selection follows the displayed frame, not bitmap overflow or text shadows.
function elementFrameClientRect(this: Konva.Group, options?: Parameters<Konva.Group['getClientRect']>[0]) {
  return this.findOne<Konva.Rect>('.element-frame')!.getClientRect(options);
}

function addElement(element: SceneElement) {
  if (!root || !element.visible) return;
  const group = new Konva.Group({
    id: element.id, x: element.x + element.width / 2, y: element.y + element.height / 2,
    offsetX: element.width / 2, offsetY: element.height / 2, width: element.width, height: element.height,
    rotation: element.rotation, opacity: element.opacity,
    draggable: !element.locked && props.tool === 'select' && !(element.type === 'image' && (props.cropMode || props.inlineCropMode || inlineActive.value)),
    // Keep native drag outside the long-press screen-space tolerance.
    dragDistance: element.type === 'image' ? 8 : Konva.dragDistance,
  });
  // Explicit hit geometry keeps text, transparent stickers and thin doodles easy to select on touch.
  group.add(new Konva.Rect({ name: 'element-frame', width: element.width, height: element.height, fill: '#000', opacity: 0 }));
  if (element.type === 'image') {
    group.getClientRect = elementFrameClientRect;
    if (element.assetId) addPicture(group, `element:${element.id}`, element.assetId, element.width, element.height, element.crop, element.filter, element);
    else {
      const outline = new Konva.Path({ data: shapePath(element.shape, element.width, element.height, element.cornerRadius), fill: '#f2ebe5', stroke: '#baa895', strokeWidth: 2, dash: [10, 8], listening: false });
      const label = new Konva.Text({ text: '+\n添加照片', width: element.width, height: element.height, align: 'center', verticalAlign: 'middle', fontSize: Math.max(14, Math.min(32, element.width / 10)), lineHeight: 1.5, fill: '#927d6b', listening: false });
      group.add(outline, label);
      placeholderNodes.push(outline, label);
    }
  }
  if (element.type === 'text') {
    const config = textNodeConfig(element);
    const hasBackground = !!element.backgroundColor && element.backgroundColor !== 'transparent';
    const text = element.curve
      ? new Konva.TextPath({ ...config, height: element.height, data: curvedTextPath(element.width, element.height, element.curve), textBaseline: 'middle' })
      : new Konva.Text({ ...config, padding: textPadding(element), verticalAlign: 'middle', wrap: 'word' });
    const height = element.curve ? element.height : textFrameHeight(element.height, text.height());
    if (text instanceof Konva.Text) text.height(height);
    group.height(height).offsetY(height / 2).y(element.y + height / 2);
    group.findOne<Konva.Rect>('.element-frame')!.height(height);
    group.getClientRect = elementFrameClientRect;
    if (hasBackground) group.add(new Konva.Rect({ width: element.width, height, fill: element.backgroundColor, cornerRadius: Math.min(element.fontSize * .22, 12), listening: false }));
    group.add(text);
  }
  if (element.type === 'shape') group.add(new Konva.Path({ data: shapePath(element.shape, element.width, element.height), fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth, shadowColor: '#20202d', shadowBlur: element.shadow, shadowOffsetY: element.shadow * .3, shadowOpacity: .3, listening: false }));
  if (element.type === 'drawing') {
    const line = new Konva.Line({ points: element.points, stroke: element.color, strokeWidth: element.strokeWidth, lineCap: 'round', lineJoin: 'round', tension: .25, opacity: element.tool === 'highlighter' ? .4 : 1, globalCompositeOperation: element.tool === 'eraser' ? 'destination-out' : 'source-over', listening: false });
    group.add(line);
    if (element.tool === 'eraser') group.globalCompositeOperation('destination-out');
  }
  group.on('click tap', event => { event.cancelBubble = true; if (props.tool === 'select' && !suppressTap()) emit('select', { kind: 'element', id: element.id }); });
  group.on('dblclick dbltap', event => { event.cancelBubble = true; if (!suppressTap() && element.type === 'text' && !element.locked) emit('editText', element.id); });
  group.on('dragstart transformstart', () => { interaction = true; emit('select', { kind: 'element', id: element.id }); });
  group.on('dragend transformend', () => {
    const width = Math.max(8, group.width() * Math.abs(group.scaleX()));
    const height = Math.max(8, group.height() * Math.abs(group.scaleY()));
    let patch: Partial<SceneElement> = { x: group.x() - width / 2, y: group.y() - height / 2, width, height, rotation: group.rotation() };
    if (element.type === 'text') patch = { ...patch, fontSize: Math.max(6, element.fontSize * Math.abs(group.scaleY())), strokeWidth: element.strokeWidth * Math.abs(group.scaleY()), shadow: element.shadow * Math.abs(group.scaleY()) };
    if (element.type === 'drawing') patch = {
      ...patch,
      points: element.points.map((value, index) => value * (index % 2 ? Math.abs(group.scaleY()) : Math.abs(group.scaleX()))),
      strokeWidth: element.strokeWidth * Math.sqrt(Math.abs(group.scaleX() * group.scaleY())),
    };
    interaction = false;
    emit('transform', { id: element.id, patch });
    void nextTick().then(scheduleBuild);
  });
  root.add(group);
  elementNodes.set(element.id, group);
}

async function rebuild() {
  if (!stage || !layer || interaction || exporting) { pendingBuild = true; return; }
  pendingBuild = false;
  const generation = ++buildGeneration;
  const active = new Set<string>();
  if (props.document.background.assetId) acquire('background', props.document.background.assetId, active);
  if (props.document.mode === 'grid') for (const slot of props.document.slots) if (slot.assetId) acquire(`slot:${slot.id}`, slot.assetId, active);
  for (const element of props.document.elements) if (element.type === 'image' && element.visible) acquire(`element:${element.id}`, element.assetId, active);
  await Promise.allSettled([...active].map(key => resources.get(key)!.ready));
  await ensureSceneFonts(props.document.elements);
  if (!mounted || generation !== buildGeneration || interaction || exporting) { pendingBuild = true; return; }
  for (const [key, resource] of resources) if (!active.has(key)) { resource.dispose(); resources.delete(key); }
  transformer?.nodes([]);
  root?.destroy(); gizmos?.destroy();
  videos.length = 0; animatedAssets.clear(); animatedBindings.length = 0; pictures.length = 0; patternNode = undefined; elementNodes.clear(); placeholderNodes.length = 0;
  const doc = props.document;
  root = new Konva.Group({ clipX: 0, clipY: 0, clipWidth: doc.width, clipHeight: doc.height });
  layer.add(root);
  addBackground();
  if (doc.mode === 'grid') for (const slot of doc.slots) {
    const rect = slotRect(doc, slot);
    const group = new Konva.Group({ ...rect, id: `slot:${slot.id}` });
    const data = shapePath(slot.shape, rect.width, rect.height, doc.cornerRadius);
    group.add(new Konva.Path({ data, fill: slot.assetId ? doc.background.color : '#f2ebe5' }));
    if (slot.assetId) addPicture(group, `slot:${slot.id}`, slot.assetId, rect.width, rect.height, slot.crop, slot.filter, { trimStart: slot.trimStart ?? 0, trimEnd: slot.trimEnd ?? null, muted: slot.muted ?? false });
    else {
      const label = new Konva.Text({ text: '+\n添加照片', width: rect.width, height: rect.height, align: 'center', verticalAlign: 'middle', fontSize: Math.max(14, Math.min(32, rect.width / 10)), lineHeight: 1.5, fill: '#aa9282', listening: false });
      group.add(label); placeholderNodes.push(label);
    }
    group.on('click tap', event => { event.cancelBubble = true; if (props.tool !== 'select' || suppressTap()) return; emit('select', { kind: 'slot', id: slot.id }); if (!slot.assetId) emit('requestAsset', slot.id); });
    root.add(group);
  }
  for (const element of doc.elements) addElement(element);
  gizmos = new Konva.Group(); layer.add(gizmos);
  selectionOutline = new Konva.Rect({ stroke: '#486252', strokeWidth: 2, dash: [8, 6], listening: false, visible: false });
  transformer = new Konva.Transformer({ rotateEnabled: true, flipEnabled: false, anchorSize: 11, anchorCornerRadius: 6, borderStroke: '#486252', anchorStroke: '#486252', anchorFill: '#fff', padding: 3, ignoreStroke: true, boundBoxFunc: (oldBox, newBox) => Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12 ? oldBox : newBox });
  gizmos.add(selectionOutline, transformer);
  await Promise.all(videos.map(binding => seekVideo(binding.video, binding.start + previewTime % Math.max(.01, binding.end - binding.start))));
  await updateAnimated(previewTime);
  if (!mounted || generation !== buildGeneration) return;
  for (const binding of videos) refreshMediaCache(binding.image);
  applyTime(previewTime, props.playing);
  updateSelection();
  layer.draw();
}

function scheduleBuild() {
  if (!mounted) return;
  buildPromise = rebuild().catch(error => emit('error', error instanceof Error ? error.message : '画布渲染失败。'));
}

function updateSelection() {
  if (!transformer || !selectionOutline) return;
  transformer.nodes([]); selectionOutline.hide();
  if (props.tool !== 'select' || (!props.selection && !cropGesture) || exporting || props.playing) { layer?.batchDraw(); return; }
  const selection = cropGesture?.selection ?? props.selection;
  if (selection?.kind === 'slot') {
    const slot = props.document.slots.find(item => item.id === selection.id);
    if (slot) selectionOutline.setAttrs({ ...slotRect(props.document, slot), visible: true, strokeWidth: 2 / viewport.value.scale, dash: [6 / viewport.value.scale, 4 / viewport.value.scale] });
  } else {
    const element = props.document.elements.find(item => item.id === selection?.id);
    const node = element && elementNodes.get(element.id);
    if (node && !element.locked) {
      if (element.type === 'image' && (props.cropMode || props.inlineCropMode || inlineActive.value)) {
        const rect = node.getClientRect({ relativeTo: root });
        selectionOutline.setAttrs({ ...rect, visible: true, strokeWidth: 2 / viewport.value.scale, dash: [] });
      } else transformer.nodes([node]);
    }
  }
  layer?.batchDraw();
}

function applyTime(time: number, animate: boolean) {
  if (!root) return;
  const doc = props.document;
  const pose = animationAt(animate ? doc.animation : 'none', time);
  root.setAttrs({ x: doc.width / 2 + pose.x, y: doc.height / 2 + pose.y, offsetX: doc.width / 2, offsetY: doc.height / 2, scaleX: pose.scale, scaleY: pose.scale, rotation: pose.rotation, opacity: pose.opacity });
  for (const [index, element] of doc.elements.entries()) {
    const node = elementNodes.get(element.id);
    if (!node || interaction) continue;
    const motion = animationAt(animate ? element.animation : 'none', time, index * .67);
    node.setAttrs({ x: element.x + node.width() / 2 + motion.x, y: element.y + node.height() / 2 + motion.y, scaleX: motion.scale, scaleY: motion.scale, rotation: element.rotation + motion.rotation, opacity: element.opacity * motion.opacity });
  }
}

function advanceVideos(time: number) {
  for (const binding of videos) {
    const target = binding.start + time % Math.max(.01, binding.end - binding.start);
    const video = binding.video;
    video.muted = binding.muted;
    if (!video.seeking && Math.abs(video.currentTime - target) > .22) video.currentTime = target;
    if (video.paused && !binding.playBlocked && !binding.playPending) {
      binding.playPending = true;
      void video.play().catch(() => {
        binding.playBlocked = true;
        emit('error', '浏览器暂不允许播放视频声音，请再次点击播放或将该视频设为静音。');
      }).finally(() => { binding.playPending = false; });
    }
    refreshMediaCache(binding.image);
  }
}

async function updateAnimated(time: number) {
  for (const [assetId, asset] of animatedAssets) {
    const frame = await getAnimatedFrame(asset, time);
    for (const binding of animatedBindings) if (binding.assetId === assetId) {
      binding.image.image(frame);
      refreshMediaCache(binding.image);
    }
  }
}

function tick(now: number) {
  raf = 0;
  if (!mounted || !props.playing || exporting) return;
  if (!clockStart) clockStart = now - previewTime * 1000;
  previewTime = Math.max(0, (now - clockStart) / 1000) % Math.max(.01, props.document.duration);
  liveFramePromise = updateAnimated(previewTime).then(() => {
    if (!mounted || !props.playing || exporting) return;
    applyTime(previewTime, true); advanceVideos(previewTime); layer?.draw();
    raf = requestAnimationFrame(tick);
  }).catch(error => emit('error', error instanceof Error ? error.message : '动态素材播放失败。'));
}

function resetPreview() {
  previewTime = 0; clockStart = 0;
  applyTime(0, false);
  const snapshot = [...videos];
  for (const binding of snapshot) binding.video.pause();
  void Promise.all([updateAnimated(0), ...snapshot.map(binding => seekVideo(binding.video, binding.start))]).then(() => {
    if (!mounted) return;
    for (const binding of snapshot) refreshMediaCache(binding.image);
    layer?.batchDraw();
  }).catch(error => emit('error', error instanceof Error ? error.message : '视频预览重置失败。'));
  layer?.batchDraw();
}

function point(event: PointerEvent): Point {
  if (!stage || !root) return { x: 0, y: 0 };
  stage.setPointersPositions(event);
  const rect = stage.container().getBoundingClientRect();
  const position = { x: (event.clientX - rect.left) * stage.width() / Math.max(1, rect.width), y: (event.clientY - rect.top) * stage.height() / Math.max(1, rect.height) };
  return root.getAbsoluteTransform().copy().invert().point(position);
}

function selectedCrop(selection: Selection, photosOnly = false): CropSource | undefined {
  if (!selection || !root) return;
  let crop: CropState, assetId: string, width: number, height: number, node: Konva.Group | undefined;
  if (selection.kind === 'slot') {
    const slot = props.document.slots.find(item => item.id === selection.id);
    if (!slot?.assetId) return;
    const rect = slotRect(props.document, slot);
    crop = slot.crop; assetId = slot.assetId; width = rect.width; height = rect.height;
    node = root.findOne<Konva.Group>((item: Konva.Node) => item.id() === `slot:${selection.id}`);
  } else {
    const element = props.document.elements.find(item => item.id === selection.id);
    if (element?.type !== 'image' || !element.visible || element.locked || !element.assetId) return;
    crop = element.crop; assetId = element.assetId; width = element.width; height = element.height;
    node = elementNodes.get(element.id);
  }
  const asset = props.assets[assetId];
  const image = node?.findOne<Konva.Image>('Image');
  if (!asset || !node || !image || (photosOnly && asset.kind !== 'image')) return;
  const frame = photoFrameGeometry(width, height, asset.kind === 'sticker' ? plainFrame : props.document.photoFrame, asset.width, asset.height);
  const absoluteCenter = node.getAbsoluteTransform().point({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
  return { crop, width: frame.width, height: frame.height, rotation: node.rotation() + crop.rotation,
    center: root.getAbsoluteTransform().copy().invert().point(absoluteCenter), asset, node, image };
}

function hitSelection(): Selection {
  let ancestor: Konva.Node | null | undefined = stage?.getIntersection(stage.getPointerPosition() ?? { x: 0, y: 0 });
  while (ancestor && ancestor !== stage) {
    const id = ancestor.id();
    if (id.startsWith('slot:')) return { kind: 'slot', id: id.slice(5) };
    if (elementNodes.has(id)) return { kind: 'element', id };
    ancestor = ancestor.getParent();
  }
  return null;
}

function suppressTap() { return inlineActive.value || performance.now() < suppressTapUntil; }

function clearHold() {
  if (hold) clearTimeout(hold.timer);
  hold = undefined;
}

function capturePointers() {
  const container = stage?.container();
  for (const id of pointers.keys()) if (container && !container.hasPointerCapture(id)) container.setPointerCapture(id);
}

function releasePointer(id: number) {
  const container = stage?.container();
  if (container?.hasPointerCapture(id)) container.releasePointerCapture(id);
}

function pointerPair() {
  const values = [...pointers.values()];
  const a = values[0], b = values[1];
  return { center: a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a ?? { x: 0, y: 0 },
    distance: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 };
}

function rebaseCrop() {
  if (!cropGesture) return;
  const pair = pointerPair();
  cropGesture.crop = { ...cropGesture.latest };
  cropGesture.start = pair.center; cropGesture.distance = pair.distance;
}

function syncDraggable() {
  for (const element of props.document.elements) elementNodes.get(element.id)?.draggable(!element.locked && props.tool === 'select' &&
    !(element.type === 'image' && (props.cropMode || props.inlineCropMode || inlineActive.value)));
}

function startCrop(selection: NonNullable<Selection>, source: CropSource, inline: boolean) {
  clearHold(); interaction = true;
  cropGesture = { selection, source, crop: { ...source.crop }, latest: { ...source.crop }, start: pointerPair().center, distance: pointerPair().distance, inline };
  if (inline) { inlineActive.value = true; syncDraggable(); }
  capturePointers();
  emit('select', selection);
  if (inline) emit('inlineStart', selection);
  updateSelection();
}

function finishInteraction(cancelled: boolean) {
  clearHold();
  const gesture = cropGesture;
  cropGesture = undefined;
  if (gesture?.inline) suppressTapUntil = performance.now() + 450;
  const ids = [...pointers.keys()]; pointers.clear();
  for (const id of ids) releasePointer(id);
  if (drawing) { drawing.line.destroy(); drawing = undefined; }
  if (!gesture && !interaction) return;
  inlineActive.value = false; interaction = false;
  if (gesture?.inline) emit('inlineEnd', { cancelled });
  syncDraggable(); updateSelection();
  void nextTick().then(() => { if (pendingBuild) scheduleBuild(); });
}

function pointerDown(event: PointerEvent) {
  if (exporting || props.playing || (event.pointerType === 'mouse' && event.button !== 0)) return;
  // A fresh intentional gesture must not inherit the previous hold's synthetic-tap guard.
  if (!cropGesture) suppressTapUntil = 0;
  const position = point(event);
  pointers.set(event.pointerId, position);
  if (cropGesture) {
    event.preventDefault(); event.stopPropagation(); capturePointers(); rebaseCrop(); return;
  }
  if (props.tool !== 'select') {
    event.preventDefault(); event.stopPropagation();
    stage?.container().setPointerCapture(event.pointerId);
    if (drawing || !root) return;
    interaction = true;
    const tool = props.tool === 'erase' ? 'eraser' : 'pen';
    const points = [position.x, position.y, position.x + .01, position.y + .01];
    const line = new Konva.Line({ points, stroke: props.brushColor, strokeWidth: props.brushSize, opacity: tool === 'eraser' ? 1 : props.brushOpacity, lineCap: 'round', lineJoin: 'round', tension: .25, listening: false, globalCompositeOperation: tool === 'eraser' ? 'destination-out' : 'source-over' });
    root.add(line); drawing = { points, line, tool }; layer?.batchDraw();
    return;
  }
  const hit = hitSelection();
  if (!props.cropMode && props.inlineDisabled) { clearHold(); return; }
  const selection = props.cropMode ? hit ?? props.selection : hit;
  const source = selectedCrop(selection, !props.cropMode);
  if (!selection || !source) { clearHold(); return; }
  if (props.cropMode || props.inlineCropMode) {
    event.preventDefault(); event.stopPropagation(); startCrop(selection, source, !props.cropMode); return;
  }
  clearHold();
  if (pointers.size !== 1 || interaction) return;
  const pointerId = event.pointerId;
  const timer = setTimeout(() => {
    const candidate = hold;
    if (!candidate || candidate.pointerId !== pointerId || !pointers.has(pointerId) || interaction || props.playing || props.inlineDisabled || props.cropMode || props.tool !== 'select') return;
    const current = selectedCrop(candidate.selection, true);
    if (!current || current.node.isDragging()) { clearHold(); return; }
    startCrop(candidate.selection, current, true);
  }, 350);
  hold = { pointerId, selection, screen: { x: event.clientX, y: event.clientY }, timer };
}

function overflow(source: CropSource, crop: CropState): Point {
  const geometry = imageGeometry(source.width, source.height, source.asset.width, source.asset.height, crop);
  const angle = crop.rotation * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  return { x: Math.max(0, geometry.width - source.width * cos - source.height * sin) / 2,
    y: Math.max(0, geometry.height - source.height * cos - source.width * sin) / 2 };
}

function sourcePoint(position: Point, source: CropSource): Point {
  const dx = position.x - source.center.x, dy = position.y - source.center.y, angle = source.rotation * Math.PI / 180;
  return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: dy * Math.cos(angle) - dx * Math.sin(angle) };
}

function pointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  if (hold && hold.pointerId === event.pointerId && Math.hypot(event.clientX - hold.screen.x, event.clientY - hold.screen.y) > 7) clearHold();
  const position = point(event); pointers.set(event.pointerId, position);
  if (drawing) {
    event.preventDefault(); event.stopPropagation();
    const points = drawing.points;
    if (Math.hypot(position.x - points[points.length - 2]!, position.y - points[points.length - 1]!) < .75) return;
    points.push(position.x, position.y); drawing.line.points(points); layer?.batchDraw();
  } else if (cropGesture) {
    event.preventDefault(); event.stopPropagation();
    const gesture = cropGesture, source = gesture.source, pair = pointerPair();
    const crop = { ...gesture.crop };
    if (pair.distance && gesture.distance) crop.zoom = Math.min(8, Math.max(1, gesture.crop.zoom * pair.distance / gesture.distance));
    const ratio = crop.zoom / gesture.crop.zoom;
    const before = overflow(source, gesture.crop), after = overflow(source, crop);
    const start = sourcePoint(gesture.start, source), current = sourcePoint(pair.center, source);
    // Flips affect the bitmap, not its translation; imageGeometry uses unflipped pan axes.
    const x = current.x + (before.x * gesture.crop.x - start.x) * ratio;
    const y = current.y + (before.y * gesture.crop.y - start.y) * ratio;
    crop.x = after.x > .0001 ? Math.max(-1, Math.min(1, x / after.x)) : gesture.crop.x;
    crop.y = after.y > .0001 ? Math.max(-1, Math.min(1, y / after.y)) : gesture.crop.y;
    gesture.latest = crop;
    emit('crop', { ...gesture.selection, crop });
    // Keep the scene and media caches intact throughout the transaction.
    const geometry = imageGeometry(source.width, source.height, source.asset.width, source.asset.height, crop);
    source.image.position({ x: geometry.x, y: geometry.y }).rotation(geometry.rotation)
      .scale({ x: geometry.width / source.asset.width * geometry.scaleX, y: geometry.height / source.asset.height * geometry.scaleY });
    layer?.batchDraw();
  }
}

function pointerUp(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  if (hold?.pointerId === event.pointerId) clearHold();
  if (!drawing && !cropGesture) { pointers.delete(event.pointerId); return; }
  event.preventDefault(); event.stopPropagation();
  if (event.type === 'pointercancel') { finishInteraction(true); return; }
  pointers.delete(event.pointerId); releasePointer(event.pointerId);
  if (cropGesture && pointers.size) { rebaseCrop(); return; }
  if (drawing) {
    const finished = drawing; drawing = undefined; finished.line.destroy();
    emit('draw', { points: [...finished.points], color: props.brushColor, width: props.brushSize, tool: finished.tool });
  }
  finishInteraction(false);
}

function cancelGesture() {
  if (hold || cropGesture || drawing) finishInteraction(true);
  else { for (const id of pointers.keys()) releasePointer(id); pointers.clear(); }
}

function lostPointerCapture(event: PointerEvent) {
  if (pointers.has(event.pointerId) && (cropGesture || drawing)) cancelGesture();
}

function keyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (hold || cropGesture)) {
    event.preventDefault();
    if (cropGesture?.inline) event.stopPropagation();
    cancelGesture();
  }
}

function suppressCompatibility(event: Event) {
  if (inlineActive.value || (performance.now() < suppressTapUntil && ['click', 'dblclick', 'mouseup', 'touchend'].includes(event.type))) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function wheel(event: WheelEvent) {
  if (!props.cropMode || !props.selection || props.tool !== 'select') return;
  const source = selectedCrop(props.selection);
  if (!source) return;
  event.preventDefault();
  emit('crop', { ...props.selection, crop: { ...source.crop, zoom: Math.max(1, Math.min(8, source.crop.zoom * Math.exp(-event.deltaY * .002))) } });
}

async function renderFrameNow(time: number, pixelRatio: number): Promise<HTMLCanvasElement> {
  if (hold || cropGesture || drawing) { cancelGesture(); await nextTick(); }
  await buildPromise;
  if (pendingBuild) { await rebuild(); await buildPromise; }
  if (!stage || !layer || !root) throw new Error('画布尚未准备完成。');
  await ensureSceneFonts(props.document.elements);
  await buildPromise;
  await Promise.all([...resources.values()].map(resource => resource.ready));
  const original = { width: stage.width(), height: stage.height(), scaleX: stage.scaleX(), scaleY: stage.scaleY(), time: previewTime, listening: stage.listening(), sceneRatio: layer.getCanvas().getPixelRatio(), hitRatio: layer.getHitCanvas().getPixelRatio() };
  const originalVideos = videos.map(binding => ({ binding, time: binding.video.currentTime, paused: binding.video.paused }));
  const ratio = Math.max(1 / Math.min(props.document.width, props.document.height), pixelRatio);
  const exportImages: HTMLCanvasElement[] = [];
  exporting = true;
  stage.listening(false);
  cancelAnimationFrame(raf); raf = 0;
  try {
    await liveFramePromise;
    await updateAnimated(Math.max(0, time));
    for (const binding of videos) binding.video.pause();
    await Promise.all(videos.map(binding => seekVideo(binding.video, binding.start + Math.max(0, time) % Math.max(.01, binding.end - binding.start))));
    layer.getCanvas().setPixelRatio(1); layer.getHitCanvas().setPixelRatio(1);
    stage.size({ width: Math.round(props.document.width * ratio), height: Math.round(props.document.height * ratio) }); stage.scale({ x: ratio, y: ratio });
    applyTime(Math.max(0, time), true);
    for (const binding of pictures) {
      const scale = binding.image.getAbsoluteScale();
      const neededSide = Math.ceil(Math.max(binding.asset.width * Math.abs(scale.x), binding.asset.height * Math.abs(scale.y)));
      if (binding.source instanceof HTMLImageElement && binding.asset.mime !== 'image/gif' && neededSide > Math.max(binding.source.naturalWidth, binding.source.naturalHeight)) {
        const image = await resizeAssetImage(binding.asset, neededSide);
        exportImages.push(image);
        binding.image.image(image);
      }
      cachePicture(binding, Math.max(Math.abs(scale.x), Math.abs(scale.y)));
    }
    if (patternNode) patternNode.cache({ x: 0, y: 0, width: props.document.width, height: props.document.height, pixelRatio: ratio, hitCanvasPixelRatio: ratio });
    gizmos?.hide(); for (const node of placeholderNodes) node.hide();
    layer.draw();
    return stage.toCanvas({ x: 0, y: 0, width: stage.width(), height: stage.height(), pixelRatio: 1 });
  } finally {
    stage.size({ width: original.width, height: original.height }); stage.scale({ x: original.scaleX, y: original.scaleY });
    layer.getCanvas().setPixelRatio(original.sceneRatio); layer.getHitCanvas().setPixelRatio(original.hitRatio);
    for (const binding of pictures) {
      binding.image.image(binding.source);
      const scale = binding.image.getAbsoluteScale();
      cachePicture(binding, Math.min(1280 / Math.max(binding.asset.width, binding.asset.height), Math.max(Math.abs(scale.x), Math.abs(scale.y)) * original.sceneRatio));
    }
    for (const image of exportImages) image.width = image.height = 0;
    if (patternNode) {
      const ratio = Math.min(1, viewport.value.scale * original.sceneRatio);
      patternNode.cache({ x: 0, y: 0, width: props.document.width, height: props.document.height, pixelRatio: ratio, hitCanvasPixelRatio: ratio });
    }
    stage.listening(original.listening);
    for (const node of placeholderNodes) node.show(); gizmos?.show();
    applyTime(original.time, props.playing);
    await Promise.allSettled(originalVideos.map(async ({ binding, time: savedTime, paused }) => {
      await seekVideo(binding.video, savedTime); refreshMediaCache(binding.image);
      if (!paused && props.playing) await binding.video.play();
    }));
    await updateAnimated(original.time).catch(error => emit('error', error instanceof Error ? error.message : '动态素材预览恢复失败。'));
    exporting = false; updateSelection(); layer.draw();
    if (pendingBuild) scheduleBuild();
    if (props.playing) { clockStart = performance.now() - previewTime * 1000; raf = requestAnimationFrame(tick); }
  }
}

function renderFrame(time: number, pixelRatio = 1): Promise<HTMLCanvasElement> {
  const result = exportQueue.then(() => renderFrameNow(time, pixelRatio));
  exportQueue = result.catch(() => {});
  return result;
}

async function elementBounds(id: string): Promise<{ width: number; height: number } | null> {
  await ensureSceneFonts(props.document.elements);
  await nextTick();
  await buildPromise;
  const node = elementNodes.get(id);
  return node ? { width: node.width(), height: node.height() } : null;
}

defineExpose<EditorCanvasHandle>({ renderFrame, resetPreview, elementBounds, measureTextHeight });
watch(() => props.document, () => {
  if (interaction) { pendingBuild = true; return; }
  resize(); scheduleBuild();
}, { deep: true });
watch(() => props.assets, () => { cancelGesture(); scheduleBuild(); }, { deep: true });
watch(() => [props.selection?.kind, props.selection?.id], () => {
  const expected = cropGesture?.selection ?? hold?.selection;
  if (expected && (props.selection?.kind !== expected.kind || props.selection?.id !== expected.id)) cancelGesture();
  updateSelection();
});
watch(() => [props.tool, props.cropMode, props.inlineCropMode, props.inlineDisabled], (current, previous) => {
  // The parent enables inlineCropMode synchronously in inlineStart; that is not a mode exit.
  if (current[0] !== previous[0] || current[1] !== previous[1] || current[3] ||
    (current[2] !== previous[2] && !(cropGesture?.inline && current[2]))) cancelGesture();
  syncDraggable(); updateSelection();
});
watch(() => JSON.stringify([
  props.document.id, props.document.mode, props.document.layoutId, props.document.width, props.document.height,
  props.document.padding, props.document.gap, props.document.photoFrame,
  props.document.slots.map(slot => [slot.id, slot.assetId, slot.x, slot.y, slot.width, slot.height, slot.shape]),
  props.document.elements.filter(element => element.type === 'image').map(element =>
    [element.id, element.assetId, element.x, element.y, element.width, element.height, element.rotation, element.visible, element.locked]),
]), cancelGesture);
watch(() => props.playing, playing => {
  cancelGesture();
  cancelAnimationFrame(raf); raf = 0;
  if (playing) {
    for (const binding of videos) binding.playBlocked = false;
    clockStart = performance.now() - previewTime * 1000; raf = requestAnimationFrame(tick);
  }
  else { for (const binding of videos) binding.video.pause(); applyTime(0, false); layer?.batchDraw(); }
  updateSelection();
});

onMounted(async () => {
  await nextTick();
  stage = stageRef.value?.getNode();
  if (!stage || !host.value) return;
  mounted = true;
  layer = new Konva.Layer(); stage.add(layer);
  stage.on('click tap', event => { if (event.target === stage && props.tool === 'select' && !suppressTap()) emit('select', null); });
  const container = stage.container();
  container.addEventListener('pointerdown', pointerDown, true);
  window.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
  window.addEventListener('pointerup', pointerUp, true);
  window.addEventListener('pointercancel', pointerUp, true);
  window.addEventListener('blur', cancelGesture);
  window.addEventListener('keydown', keyDown, true);
  container.addEventListener('lostpointercapture', lostPointerCapture);
  for (const type of compatibilityEvents) container.addEventListener(type, suppressCompatibility, { capture: true, passive: false });
  container.addEventListener('wheel', wheel, { passive: false });
  resizeObserver = new ResizeObserver(resizeForViewport); resizeObserver.observe(host.value);
  window.addEventListener('resize', resizeForViewport);
  resize(); scheduleBuild();
  if (props.playing) raf = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  cancelGesture();
  mounted = false; ++buildGeneration; cancelAnimationFrame(raf); resizeObserver?.disconnect(); window.removeEventListener('resize', resizeForViewport);
  const container = stage?.container();
  container?.removeEventListener('pointerdown', pointerDown, true);
  window.removeEventListener('pointermove', pointerMove, true);
  window.removeEventListener('pointerup', pointerUp, true);
  window.removeEventListener('pointercancel', pointerUp, true);
  window.removeEventListener('blur', cancelGesture);
  window.removeEventListener('keydown', keyDown, true);
  container?.removeEventListener('lostpointercapture', lostPointerCapture);
  for (const type of compatibilityEvents) container?.removeEventListener(type, suppressCompatibility, true);
  container?.removeEventListener('wheel', wheel);
  for (const resource of resources.values()) resource.dispose(); resources.clear();
  stage?.off('click tap'); layer?.destroy();
});
</script>

<template>
  <div ref="host" class="editor-canvas-host" :class="{ 'is-drawing': tool !== 'select', 'is-cropping': cropMode || inlineCropMode || inlineActive, 'is-inline-active': inlineActive }">
    <div class="editor-canvas-paper" :style="{ width: `${viewport.width}px`, height: `${viewport.height}px` }">
      <v-stage ref="stageRef" :config="stageConfig" />
      <slot />
      <div v-if="!cropMode && !inlineDisabled && (inlineActive || inlineCropMode)" class="inline-crop-hint" role="status" aria-live="polite">
        {{ inlineActive ? '正在原位调整' : '照片原位调整' }} · 拖动平移，双指缩放
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-canvas-host { width: 100%; display: flex; justify-content: center; align-items: center; padding: 0; min-height: 180px; touch-action: none; user-select: none; }
.editor-canvas-paper { position: relative; flex: none; overflow: hidden; background: #fff; box-shadow: var(--shadow-float); }
.is-drawing { cursor: crosshair; }
.is-cropping { cursor: grab; }
.is-cropping:active { cursor: grabbing; }
.is-inline-active { cursor: grabbing; }
.inline-crop-hint { position: absolute; z-index: 1; left: 50%; bottom: 10px; transform: translateX(-50%); max-width: calc(100% - 20px); padding: 7px 11px; border: 1px solid rgba(255,255,255,.35); border-radius: 999px; background: rgba(34,49,41,.82); color: #fff; font-size: 12px; line-height: 1.4; white-space: nowrap; pointer-events: none; }
</style>
