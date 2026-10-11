export type EditorMode = 'grid' | 'free';
export type CollageCreationMode = 'grid' | 'long' | 'free';
export interface CollageSetup {
  mode: CollageCreationMode;
  width: number;
  height: number;
  template?: TemplatePreset;
}
export interface PhotoSelectionEntry {
  id: string;
  assetId: string;
}
export type AnimationKind = 'none' | 'float' | 'pulse' | 'wiggle' | 'pop' | 'fade';
export type ImageShape = 'rect' | 'circle' | 'heart' | 'star';
export type PatternKind = 'none' | 'dots' | 'grid' | 'stripes' | 'paper' | 'checker';
export type CutoutModelKind = 'portrait' | 'subject';

export interface CropState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}
export interface FilterState {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: boolean;
  sepia: boolean;
}
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CollageSlot extends NormalizedRect {
  id: string;
  assetId: string | null;
  crop: CropState;
  filter: FilterState;
  shape: ImageShape;
  trimStart?: number;
  trimEnd?: number | null;
  muted?: boolean;
}
export interface BackgroundSpec {
  color: string;
  pattern: PatternKind;
  patternColor: string;
  assetId: string | null;
}
export interface ElementBase {
  id: string;
  type: 'image' | 'text' | 'drawing' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  animation: AnimationKind;
  shadow: number;
}
export interface ImageElement extends ElementBase {
  type: 'image';
  assetId: string;
  crop: CropState;
  filter: FilterState;
  shape: ImageShape;
  borderWidth: number;
  borderColor: string;
  cornerRadius: number;
  trimStart: number;
  trimEnd: number | null;
  muted: boolean;
}
export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic';
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  stroke: string;
  strokeWidth: number;
  backgroundColor: string;
  curve: number;
}
export interface DrawingElement extends ElementBase {
  type: 'drawing';
  points: number[];
  color: string;
  strokeWidth: number;
  tool: 'pen' | 'highlighter' | 'eraser';
}
export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ImageShape;
  fill: string;
  stroke: string;
  strokeWidth: number;
}
export type SceneElement = ImageElement | TextElement | DrawingElement | ShapeElement;
export interface AudioTrack {
  assetId: string;
  start: number;
  end: number | null;
  volume: number;
}
export interface PhotoFrameSpec {
  kind: 'none' | 'paper' | 'instant' | 'film';
  color: string;
  insetRatio: number;
  footerRatio: number;
  shadowRatio: number;
}
export interface EditorDocument {
  version: 1;
  id: string;
  title: string;
  mode: EditorMode;
  width: number;
  height: number;
  background: BackgroundSpec;
  layoutId: string;
  slots: CollageSlot[];
  elements: SceneElement[];
  padding: number;
  gap: number;
  cornerRadius: number;
  photoFrame: PhotoFrameSpec;
  duration: number;
  fps: number;
  animation: AnimationKind;
  audio: AudioTrack | null;
  createdAt: number;
  updatedAt: number;
}
export interface MediaAsset {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'sticker' | 'audio';
  mime: string;
  width: number;
  height: number;
  duration: number;
  blob: Blob;
  src: string;
  thumbnail: string;
}
export interface LayoutPreset {
  id: string;
  name: string;
  count: number;
  slots: NormalizedRect[];
  category?: 'balanced' | 'feature' | 'editorial' | 'contact';
  description?: string;
}
export interface TemplatePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  width: number;
  height: number;
  mode: EditorMode;
  layoutId: string;
  background: BackgroundSpec;
  padding: number;
  gap: number;
  cornerRadius: number;
  animation: AnimationKind;
  elements: SceneElement[];
  photoLayering?: 'overlay';
  photoFrames?: Array<NormalizedRect & { rotation?: number; shape?: ImageShape; borderWidth?: number; borderColor?: string }>;
}
export interface StickerPreset {
  id: string;
  name: string;
  category: string;
  svg: string;
}
export type Selection = { kind: 'slot' | 'element'; id: string } | null;
export interface CropChange {
  kind: 'slot' | 'element';
  id: string;
  crop: CropState;
}
export interface TransformChange {
  id: string;
  patch: Partial<SceneElement>;
}
export interface DrawingChange {
  points: number[];
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
}
export type TextHeightMeasurer = (element: TextElement) => number;
export interface EditorCanvasHandle {
  renderFrame: (time: number, pixelRatio?: number) => Promise<HTMLCanvasElement>;
  resetPreview: () => void;
  elementBounds: (id: string) => Promise<{ width: number; height: number } | null>;
  measureTextHeight: TextHeightMeasurer;
}
export interface ExportOptions {
  format: 'png' | 'jpeg' | 'webp' | 'mp4' | 'webm' | 'gif';
  scale: number;
  quality: number;
  duration: number;
  fps: number;
}
export type ProgressCallback = (progress: number, message: string) => void;
export interface EditorProject {
  version: 1;
  id: string;
  title: string;
  pages: EditorDocument[];
  activePageId: string;
}
export interface StoredDraft {
  id: string;
  project: EditorProject;
  assets: Array<Omit<MediaAsset, 'src' | 'thumbnail'> & { thumbnailBlob?: Blob }>;
  thumbnail: Blob;
  updatedAt: number;
}
