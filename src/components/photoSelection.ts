import type { MediaAsset } from '../types';
import type { MediaImportProgress } from '../services/media';

export interface PhotoSelectionItem {
  id: string;
  asset: MediaAsset;
}

export interface PhotoImportItem {
  index: number;
  name: string;
  stage: MediaImportProgress['stage'] | 'queued';
  progress: number;
  message: string;
  assetId?: string;
}
