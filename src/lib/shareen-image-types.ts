import { parseShareEnImageUrl } from './image-proxy';

export const WIDE_IMAGE = { width: 1072, height: 360 } as const;
export const SPLIT_IMAGE = { width: 400, height: 480 } as const;
export const IMAGE_POLICY_VERSION = 'shareen-image-v1';
export const MAX_IMAGE_BYTES = 512 * 1024;
export type ImageRegion = { x: number; y: number; width: number; height: number };
export type ImageCrop = { left: number; top: number; width: number; height: number };
export type ShareEnImageAsset = {
  version: 1;
  id: string;
  requestKey: string;
  sourceUrl: string;
  sourceHash: string;
  model: string;
  policyVersion: string;
  layout: 'wide' | 'split';
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  crop?: ImageCrop;
  protectedRegions: ImageRegion[];
  confidence: number;
  reason: string;
  processedAt: string;
  mime: 'image/webp';
  /** Private server persistence only; never send through admin JSON. */
  dataBase64?: string;
};

export function isImageRegion(value: unknown): value is ImageRegion {
  if (!value || typeof value !== 'object') return false;
  const r = value as ImageRegion;
  return [r.x, r.y, r.width, r.height].every(v => typeof v === 'number' && Number.isFinite(v)) &&
    r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= 1 && r.y + r.height <= 1;
}

/** Shared by fresh crop selection and browser-safe cache validation. Margins may not be clipped. */
export function isSafeWideCrop(width: number, height: number, crop: unknown, regions: unknown, confidence: unknown): crop is ImageCrop {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 12_000_000 ||
      typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < .65 || confidence > 1 ||
      !Array.isArray(regions) || !regions.length || regions.length > 32 || !regions.every(isImageRegion) ||
      !crop || typeof crop !== 'object') return false;
  const c = crop as ImageCrop;
  if (![c.left,c.top,c.width,c.height].every(Number.isSafeInteger) || c.left < 0 || c.top < 0 || c.width <= 0 || c.height <= 0 ||
      c.left + c.width > width || c.top + c.height > height || WIDE_IMAGE.width / c.width > 2 || WIDE_IMAGE.height / c.height > 2 ||
      Math.abs(c.height - c.width * WIDE_IMAGE.height / WIDE_IMAGE.width) > 1) return false;
  return regions.every(r =>
    Math.floor((r.x - .04) * width) >= c.left && Math.floor((r.y - .04) * height) >= c.top &&
    Math.ceil((r.x + r.width + .04) * width) <= c.left + c.width &&
    Math.ceil((r.y + r.height + .04) * height) <= c.top + c.height);
}

/** Browser-safe structural validation; malformed optional caches simply disappear. */
export function validateImageAsset(value: unknown): ShareEnImageAsset | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const a = value as ShareEnImageAsset;
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  if (a.version !== 1 || !hash(a.id) || !hash(a.requestKey) || !hash(a.sourceHash) ||
      typeof a.sourceUrl !== 'string' || a.sourceUrl.length > 8192 ||
      typeof a.model !== 'string' || !a.model || a.model.length > 120 ||
      typeof a.policyVersion !== 'string' || !a.policyVersion || a.policyVersion.length > 120 ||
      !['wide', 'split'].includes(a.layout) || a.mime !== 'image/webp' ||
      !positive(a.sourceWidth) || !positive(a.sourceHeight) || a.sourceWidth * a.sourceHeight > 12_000_000 ||
      !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1 ||
      typeof a.reason !== 'string' || a.reason.length > 240 ||
      typeof a.processedAt !== 'string' || a.processedAt.length > 40 || !Number.isFinite(Date.parse(a.processedAt)) ||
      !Array.isArray(a.protectedRegions) || a.protectedRegions.length > 32 || !a.protectedRegions.every(isImageRegion)) return undefined;
  try { parseShareEnImageUrl(a.sourceUrl); } catch { return undefined; }
  const size = a.layout === 'wide' ? WIDE_IMAGE : SPLIT_IMAGE;
  if (a.width !== size.width || a.height !== size.height) return undefined;
  let crop: ImageCrop | undefined;
  if (a.crop !== undefined) {
    const c = a.crop;
    if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.left) || !Number.isSafeInteger(c.top) ||
        c.left < 0 || c.top < 0 || !positive(c.width) || !positive(c.height) ||
        c.left + c.width > a.sourceWidth || c.top + c.height > a.sourceHeight) return undefined;
    crop = { left: c.left, top: c.top, width: c.width, height: c.height };
  }
  if ((a.layout === 'wide' && !crop) || (a.layout === 'split' && crop)) return undefined;
  if (a.layout === 'wide' && !isSafeWideCrop(a.sourceWidth,a.sourceHeight,crop,a.protectedRegions,a.confidence)) return undefined;
  if (a.dataBase64 !== undefined) {
    if (typeof a.dataBase64 !== 'string' || !a.dataBase64.length ||
        a.dataBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.dataBase64)) return undefined;
    const padding = a.dataBase64.endsWith('==') ? 2 : a.dataBase64.endsWith('=') ? 1 : 0;
    if (a.dataBase64.length / 4 * 3 - padding > MAX_IMAGE_BYTES) return undefined;
  }
  return {
    version: 1, id: a.id, requestKey: a.requestKey, sourceUrl: a.sourceUrl, sourceHash: a.sourceHash,
    model: a.model, policyVersion: a.policyVersion, layout: a.layout, width: a.width, height: a.height,
    sourceWidth: a.sourceWidth, sourceHeight: a.sourceHeight, ...(crop ? { crop } : {}),
    protectedRegions: a.protectedRegions.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
    confidence: a.confidence, reason: a.reason, processedAt: a.processedAt, mime: 'image/webp',
    ...(a.dataBase64 !== undefined ? { dataBase64: a.dataBase64 } : {})
  };
}
