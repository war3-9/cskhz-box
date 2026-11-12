// Read dimensions before asking the decoder to allocate an original-size bitmap.
export async function imageDimensions(file: Blob): Promise<{ width: number; height: number; type: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let width = 0, height = 0, type = '';
  let rotated = false;
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) &&
      view.getUint32(12) === 0x49484452) {
    width = view.getUint32(16); height = view.getUint32(20); type = 'image/png';
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker === 0xe1 && length >= 16 && view.getUint32(offset+2) === 0x45786966 && view.getUint16(offset+6) === 0) {
        const tiff = offset + 8, end = offset + length;
        const little = view.getUint16(tiff) === 0x4949;
        if ((little || view.getUint16(tiff) === 0x4d4d) && view.getUint16(tiff+2,little) === 42) {
          const directory = tiff + view.getUint32(tiff+4,little);
          if (directory >= tiff+8 && directory+2 <= end) {
            const count = view.getUint16(directory,little);
            for (let tag=directory+2; tag+12<=end && tag<directory+2+count*12; tag+=12) {
              if (view.getUint16(tag,little) === 0x0112 && view.getUint16(tag+2,little) === 3 && view.getUint32(tag+4,little) === 1) {
                const orientation = view.getUint16(tag+8,little);
                rotated = orientation >= 5 && orientation <= 8;
              }
            }
          }
        }
      }
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
        height = view.getUint16(offset+3); width = view.getUint16(offset+5); type = 'image/jpeg'; break;
      }
      offset += length;
    }
  }
  if (!width || !height) throw new Error('图片内容无效，请选择有效的 PNG 或 JPG。');
  if (width > 40000 || height > 40000 || width * height > 40_000_000)
    throw new Error('图片尺寸过大，请先缩小至 4000 万像素以下。');
  return rotated ? { width:height, height:width, type } : { width, height, type };
}
