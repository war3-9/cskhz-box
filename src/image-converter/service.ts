import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { decodeTexture } from '../model-viewer/resources/textures';
import { encodeCanvas } from '../export/encodeCanvas';
import { writeBatchImage } from '../export/batchIO';
import { blpDimensions } from '../export/gameFormats/settings';
import { encodeBlp } from '../export/gameFormats/blp';
import { cleanIconPrefix, disabledRaster } from '../export/iconPairs/config';
import { nextIconPairSequence, writeIconPair } from '../export/iconPairs/io';

export const conversionFormats = ['blp', 'tga', 'png', 'jpg'] as const;
export type ConversionFormat = typeof conversionFormats[number];
export type ConversionSize = 0 | 64 | 128;
interface ConversionFile { path: string; name: string }
export interface ConversionSource {
  directory: string;
  outputDirectory: string;
  files: ConversionFile[];
}
export interface ConversionProgress { done: number; total: number; name: string }
export interface ConversionResult {
  succeeded: number;
  failed: { name: string; error: string }[];
  total: number;
  stopped: boolean;
  outputDirectory: string;
}

export async function selectConversionSource(folder: boolean): Promise<ConversionSource | null> {
  if (!isTauri()) throw new Error('请在桌面版中转换电脑上的图片。');
  const path = await open({
    title: folder ? '选择需要转换的图片文件夹' : '选择需要转换的图片',
    directory: folder,
    multiple: false,
    ...(!folder ? { filters: [{ name: '图片文件', extensions: ['blp', 'tga', 'png', 'jpg', 'jpeg'] }] } : {}),
  });
  return path ? invoke<ConversionSource>('image_conversion_scan', { path }) : null;
}

export function convertedFilename(name: string, format: ConversionFormat) {
  return `${name.replace(/\.[^.]+$/, '')}.${format}`;
}

export async function conversionCanvas(bytes: ArrayBuffer, name: string, format: ConversionFormat, size: ConversionSize = 0) {
  if (![0, 64, 128].includes(size)) throw new Error('转换尺寸无效');
  const [image] = await decodeTexture(bytes, name);
  const original = document.createElement('canvas');
  original.width = image.width; original.height = image.height;
  original.getContext('2d')!.putImageData(image, 0, 0);
  const canvas = document.createElement('canvas');
  const dimensions = format === 'blp' ? blpDimensions(image.width, image.height, size) : { width: size || image.width, height: size || image.height };
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(original, 0, 0, canvas.width, canvas.height);
  // JPEG has no alpha channel; keep transparent icons readable on a white background.
  if (format === 'jpg') {
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
  }
  return canvas;
}
async function convertImage(bytes: ArrayBuffer, name: string, format: ConversionFormat, size: ConversionSize = 0): Promise<Blob> {
  return encodeCanvas(await conversionCanvas(bytes, name, format, size), format === 'jpg' ? 'jpeg' : format);
}
async function convertPair(bytes: ArrayBuffer, name: string, directory: string, size: ConversionSize) {
  const canvas = await conversionCanvas(bytes, name, 'blp', size);
  const raster = { width: canvas.width, height: canvas.height, data: new Uint8Array(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data) };
  const normal = new Blob([encodeBlp(raster)], { type: 'image/blp' });
  const disabled = new Blob([encodeBlp(disabledRaster(raster, 60))], { type: 'image/blp' });
  const prefix = cleanIconPrefix(name.replace(/\.[^.]+$/, '')) || 'icon';
  let start = 1;
  while (start <= 100000) {
    const sequence = await nextIconPairSequence(directory, prefix, start);
    if (await writeIconPair(directory, prefix, sequence, normal, disabled)) return;
    start = sequence + 1;
  }
  throw new Error('可用图标序号已用完');
}

export async function convertImages(
  source: ConversionSource,
  format: ConversionFormat,
  progress: (value: ConversionProgress) => void,
  shouldStop = () => false,
  size: ConversionSize = 0,
): Promise<ConversionResult> {
  if (!conversionFormats.includes(format)) throw new Error('不支持的转换格式');
  if (!isTauri()) throw new Error('请在桌面版中转换电脑上的图片。');
  const result: ConversionResult = {
    succeeded: 0, failed: [], total: source.files.length, stopped: false, outputDirectory: source.outputDirectory,
  };
  for (const file of source.files) {
    if (shouldStop()) { result.stopped = true; break; }
    progress({ done: result.succeeded + result.failed.length, total: result.total, name: file.name });
    // Let the progress display update before the next image is decoded and encoded.
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const bytes = await invoke<ArrayBuffer>('image_conversion_read', { path: file.path });
      if (format === 'blp') {
        const directory = await invoke<string>('image_conversion_prepare', { directory: source.directory });
        await convertPair(bytes, file.name, directory, size);
      } else {
        const blob = await convertImage(bytes, file.name, format, size);
        await writeBatchImage(source.directory, convertedFilename(file.name, format), blob, '转换图片');
      }
      result.succeeded++;
    } catch (error) {
      result.failed.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
    }
    progress({ done: result.succeeded + result.failed.length, total: result.total, name: file.name });
  }
  return result;
}

export async function openConversionDirectory(directory: string) {
  await invoke('image_conversion_open', { directory });
}
