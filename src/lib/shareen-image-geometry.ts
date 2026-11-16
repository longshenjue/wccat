import { isImageRegion, isSafeWideCrop, WIDE_IMAGE, type ImageCrop, type ImageRegion } from './shareen-image-types';

type ImagePlan = { layout: 'wide' | 'split'; crop?: ImageCrop; protectedRegions: ImageRegion[]; confidence: number; reason: string };

/** The model proposes protected subjects; integer geometry makes the final decision. */
export function selectImagePlan(width: number, height: number, value: unknown): ImagePlan {
  const split: ImagePlan = { layout: 'split', protectedRegions: [], confidence: 0, reason: 'Invalid vision suggestion; preserve full source' };
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width * height > 12_000_000 || !value || typeof value !== 'object') return split;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.protectedRegions) || !v.protectedRegions.length || v.protectedRegions.length > 32 || !v.protectedRegions.every(isImageRegion)) return split;
  const regions = v.protectedRegions.map(r => ({x:r.x,y:r.y,width:r.width,height:r.height}));
  const confidence = typeof v.confidence === 'number' && Number.isFinite(v.confidence) && v.confidence >= 0 && v.confidence <= 1 ? v.confidence : 0;
  const fallback: ImagePlan = { layout: 'split', protectedRegions: regions, confidence, reason: 'Preserve all protected subjects in full source' };
  const focal = v.focalPoint as {x?:unknown;y?:unknown} | null;
  if (v.mode !== 'wide' || confidence < .65 || typeof v.reason !== 'string' || !v.reason.trim() ||
      !focal || typeof focal.x !== 'number' || typeof focal.y !== 'number' ||
      !Number.isFinite(focal.x) || !Number.isFinite(focal.y) || focal.x < 0 || focal.x > 1 || focal.y < 0 || focal.y > 1) return fallback;
  // Require the full 4% source margin, including at source edges.
  const left = Math.floor((Math.min(...regions.map(r => r.x)) - .04) * width);
  const top = Math.floor((Math.min(...regions.map(r => r.y)) - .04) * height);
  const right = Math.ceil((Math.max(...regions.map(r => r.x + r.width)) + .04) * width);
  const bottom = Math.ceil((Math.max(...regions.map(r => r.y + r.height)) + .04) * height);
  const ratio = WIDE_IMAGE.width / WIDE_IMAGE.height;
  const cropWidth = Math.min(width, Math.floor(height * ratio));
  const cropHeight = Math.min(height, Math.floor(cropWidth / ratio));
  if (right - left > cropWidth || bottom - top > cropHeight ||
      WIDE_IMAGE.width / cropWidth > 2 || WIDE_IMAGE.height / cropHeight > 2) return fallback;
  const minX = Math.max(0, right - cropWidth), maxX = Math.min(left, width - cropWidth);
  const minY = Math.max(0, bottom - cropHeight), maxY = Math.min(top, height - cropHeight);
  if (minX > maxX || minY > maxY) return fallback;
  const x = Math.max(minX, Math.min(maxX, Math.round(focal.x * width - cropWidth / 2)));
  const y = Math.max(minY, Math.min(maxY, Math.round(focal.y * height - cropHeight / 2)));
  const crop = { left: x, top: y, width: cropWidth, height: cropHeight };
  if (!isSafeWideCrop(width,height,crop,regions,confidence)) return fallback;
  return { layout: 'wide', crop, protectedRegions: regions, confidence, reason: v.reason.slice(0, 240) };
}
