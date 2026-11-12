import { expect, it } from 'vitest';
import { imageDimensions } from './imageDimensions';
function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(12,0x49484452); view.setUint32(16,width); view.setUint32(20,height);
  return new Blob([bytes]);
}
it('reads PNG/JPEG dimensions and rejects excessive or malformed headers before decoding', async () => {
  await expect(imageDimensions(png(512,256))).resolves.toEqual({ width:512,height:256,type:'image/png' });
  await expect(imageDimensions(png(40000,40000))).rejects.toThrow('尺寸过大');
  await expect(imageDimensions(png(40001,1))).rejects.toThrow('尺寸过大');
  await expect(imageDimensions(png(0,1))).rejects.toThrow('无效');
  await expect(imageDimensions(new Blob([new Uint8Array([255,216,255,192,0,8,8,0,16,0,32,1])]))).resolves.toEqual({ width:32,height:16,type:'image/jpeg' });
  await expect(imageDimensions(new Blob(['bad']))).rejects.toThrow('无效');
});
