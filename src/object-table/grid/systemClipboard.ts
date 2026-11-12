import { clipboardType, decodeTsv } from '../clipboard';

export interface GridClipboardData { text: string; payload?: string }
const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function clipboardHtml(data: GridClipboardData) {
  const rows = decodeTsv(data.text).map(row => `<tr>${row.map(value => `<td>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</td>`).join('')}</tr>`).join('');
  return `<table data-box-object-cells="${encodeURIComponent(data.payload ?? '')}"><tbody>${rows}</tbody></table>`;
}
export function clipboardFromData(data: Pick<DataTransfer, 'getData'>): GridClipboardData {
  const custom = data.getData(clipboardType);
  const embedded = /data-box-object-cells="([^"]*)"/.exec(data.getData('text/html'))?.[1];
  return { text: data.getData('text/plain'), payload: custom || (embedded ? decodeURIComponent(embedded) : undefined) };
}
export async function writeGridClipboard(data: GridClipboardData) {
  if (!navigator.clipboard?.write) throw new Error('系统剪贴板不可用，请重新打开软件后重试');
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([data.text], { type: 'text/plain' }),
    'text/html': new Blob([clipboardHtml(data)], { type: 'text/html' }),
  })]);
}
export async function readGridClipboard(): Promise<GridClipboardData> {
  if (!navigator.clipboard?.read) throw new Error('系统剪贴板不可用，请重新打开软件后重试');
  const items = await navigator.clipboard.read();
  for (const item of items) {
    if (!item.types.includes('text/plain')) continue;
    const text = await (await item.getType('text/plain')).text();
    const html = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
    return clipboardFromData({ getData: type => type === 'text/plain' ? text : type === 'text/html' ? html : '' });
  }
  throw new Error('剪贴板中没有可粘贴的表格文本');
}

// Shared across grids/tasks: a quick Ctrl+V must wait for the preceding system write.
let lastWrite: Promise<void> | undefined;
export function writeInOrder(action: () => Promise<void>) {
  const previous = lastWrite;
  const next = previous ? previous.catch(() => {}).then(action) : action();
  lastWrite = next;
  return next;
}
export async function afterClipboardWrite() {
  const pending = lastWrite;
  try { await pending; }
  catch (error) { if (lastWrite === pending) lastWrite = undefined; throw error; }
}
