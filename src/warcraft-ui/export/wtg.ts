import { buildTActionPlan, type TArg as Arg, type TEca as Eca } from './tActions';
import type { UiNode } from '../document/model';
import { withFrameVariables } from '../document/frameVariables';
import { defaultArrayName, validateArrayName } from '../document/arrayName';
import type { TMode } from './tLoops';

const encoder = new TextEncoder();
class Writer {
  private readonly chunks: Uint8Array[] = [];
  private size = 0;
  bytes(...values: number[]) { const out = Uint8Array.from(values); this.chunks.push(out); this.size += out.length; }
  i32(value: number) { const out = new Uint8Array(4); new DataView(out.buffer).setInt32(0, value, true); this.chunks.push(out); this.size += 4; }
  str(value: string) {
    if (value.includes('\0')) throw new Error('T 触发字段不能包含空字符');
    const out = encoder.encode(`${value}\0`);
    if (out.length > 300) throw new Error('单个 T 触发字段不能超过 299 个 UTF-8 字节');
    this.chunks.push(out); this.size += out.length;
  }
  result() { const out = new Uint8Array(this.size); let offset = 0; for (const chunk of this.chunks) { out.set(chunk, offset); offset += chunk.length; } return out; }
}
function writeArg(writer: Writer, arg: Arg) {
  writer.i32(arg.type); writer.str(arg.value);
  writer.i32(arg.call ? 1 : 0);
  if (arg.call) writeEca(writer, arg.call);
  writer.i32(arg.index ? 1 : 0);
  if (arg.index) writeArg(writer, arg.index);
}
function writeEca(writer: Writer, eca: Eca, child = false) {
  writer.i32(eca.type);
  if (child) writer.i32(0);
  writer.str(eca.name); writer.i32(1);
  for (const arg of eca.args ?? []) writeArg(writer, arg);
  writer.i32(eca.children?.length ?? 0);
  for (const nested of eca.children ?? []) writeEca(writer, nested, true);
}
export function exportT(nodes: UiNode[], arrayName = defaultArrayName, mode: TMode = 'individual') {
  validateArrayName(arrayName);
  if (nodes.length > 512) throw new Error('T 导出暂支持最多 512 个元素');
  const prepared = withFrameVariables(nodes);
  const writer = new Writer(); writer.bytes(87, 84, 71, 33); writer.i32(7);
  writer.i32(1); writer.i32(0); writer.str('War3UI-Lab'); writer.i32(0);
  writer.i32(2); writer.i32(prepared.length ? 1 : 0);
  if (prepared.length) {
    writer.str(arrayName); writer.str('frame'); writer.i32(1); writer.i32(1);
    writer.i32(1); writer.i32(0); writer.str('');
  }
  const actions = buildTActionPlan(prepared, arrayName, mode);
  writer.i32(1); writer.str('War3Lab_CreateUI'); writer.str(''); writer.i32(0); writer.i32(1); writer.i32(0); writer.i32(0); writer.i32(0); writer.i32(0);
  writer.i32(1 + actions.length); writeEca(writer, { type: 0, name: 'MapInitializationEvent' });
  for (const item of actions) writeEca(writer, item);
  const wct = new Writer(); wct.i32(1); wct.str(''); wct.i32(0); wct.i32(1); wct.i32(0);
  return { wtg: writer.result(), wct: wct.result() };
}
