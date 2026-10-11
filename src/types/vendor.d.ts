declare module 'gifenc' {
  export type Palette = number[][];
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number }): Palette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array<ArrayBuffer>;
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: Palette; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number }): void;
    finish(): void;
    bytesView(): Uint8Array<ArrayBuffer>;
    reset(): void;
  };
}

declare module 'gifuct-js' {
  export interface GifFrame {
    dims: { top: number; left: number; width: number; height: number };
    delay: number;
    disposalType: number;
    transparentIndex?: number;
    patch: Uint8ClampedArray<ArrayBuffer>;
  }
  export interface ParsedGif {
    lsd: { width: number; height: number; backgroundColorIndex: number };
    gct?: number[][];
    frames: { image?: { descriptor: { left: number; top: number; width: number; height: number } } }[];
  }
  export function parseGIF(buffer: ArrayBuffer): ParsedGif;
  export function decompressFrames(gif: ParsedGif, buildImagePatches: true): GifFrame[];
}

interface PromiseConstructor {
  withResolvers<T>(): { promise: Promise<T>; resolve(value: T | PromiseLike<T>): void; reject(reason?: unknown): void };
}
