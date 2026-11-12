import { cleanFilename } from '../batchConfig';
import { validateRaster, type Raster } from '../gameFormats/raster';

export interface IconPairOptions {
  enabled: boolean;
  prefix: string;
  brightness: number;
}
export const defaultIconPairOptions: IconPairOptions = { enabled: false, prefix: '', brightness: 60 };
export function cleanIconPrefix(value: string) {
  return value.trim() ? cleanFilename(value).slice(0, 80) : '';
}
export function validateIconPairs(options: IconPairOptions) {
  if (!options.enabled) return '';
  if (!cleanIconPrefix(options.prefix)) return '请输入文件头';
  if (!Number.isInteger(options.brightness) || options.brightness < 0 || options.brightness > 100)
    return '暗图亮度必须为 0 至 100 的整数';
  return '';
}
export function iconPairNames(prefix: string, sequence: number) {
  const stem = `${cleanIconPrefix(prefix)}(${sequence})`;
  return { normal: `BTN${stem}.blp`, disabled: `DISBTN${stem}.blp` };
}
export function disabledRaster(source: Raster, brightness: number): Raster {
  validateRaster(source);
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) throw new Error('暗图亮度无效');
  const data = new Uint8Array(source.data);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round((data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) * brightness / 100);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  return { width: source.width, height: source.height, data };
}
