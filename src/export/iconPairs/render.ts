import type { EditorDocument } from '../../shared/types';
import { renderDocumentCanvas } from '../render';
import { blpDimensions } from '../gameFormats/settings';
import { encodeBlp } from '../gameFormats/blp';
import { disabledRaster } from './config';

export async function renderIconPair(document: EditorDocument, brightness: number, blpSize?: number) {
  const canvas = await renderDocumentCanvas(document);
  const size = blpDimensions(canvas.width, canvas.height, blpSize);
  const output = window.document.createElement('canvas');
  output.width = size.width;
  output.height = size.height;
  const context = output.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, size.width, size.height);
  const raster = { ...size, data: new Uint8Array(context.getImageData(0, 0, size.width, size.height).data) };
  return {
    normal: new Blob([encodeBlp(raster)], { type: 'image/blp' }),
    disabled: new Blob([encodeBlp(disabledRaster(raster, brightness))], { type: 'image/blp' }),
  };
}
