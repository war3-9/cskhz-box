import { SaxesParser } from 'saxes';
import type { FileEntry } from '@zip.js/zip.js';

export async function xmlEntry(entry: FileEntry, parser: SaxesParser, progress?: (done: number, total: number) => void) {
  if (entry.uncompressedSize > 1024 * 1024 * 1024) throw new Error('单个 XML 超过 1GB 限制');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  await entry.getData(new WritableStream<Uint8Array>({
    write(chunk) { parser.write(decoder.decode(chunk, { stream: true })); },
    close() { parser.write(decoder.decode()).close(); },
  }), { useWebWorkers: false, checkSignature: true, onprogress: progress });
}
export const tagName = (name: string) => name.split(':').at(-1)!;
export const xmlParser = () => new SaxesParser({ xmlns: false });
export const excelText = (value: string) => value.replace(/_x([0-9a-f]{4})_/gi, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)));
