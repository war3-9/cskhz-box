import type { ObjectColumn, CategoryId } from '../schema';
import type { NativeField } from '../sync/types';
import { fieldKey } from '../sync/types';
import { resolveField } from './metadata';

/** Last matching column wins. A new map-specific column extends every lazy index. */
export function columnIndex(kind: CategoryId, columns: ObjectColumn[]) {
  const contexts = new Map<string, { length: number; fields: Map<string, ObjectColumn>; names: Map<string, ObjectColumn> }>();
  return (parent: string, field: Pick<NativeField, 'id' | 'level' | 'data'>, known: boolean, name: string) => {
    let index = contexts.get(parent);
    if (!index) { index = { length: 0, fields: new Map(), names: new Map() }; contexts.set(parent, index); }
    for (; index.length < columns.length; index.length++) {
      const col = columns[index.length], meta = resolveField(kind, parent, col.field, true);
      index.names.set(col.field, col);
      if (meta) index.fields.set(fieldKey({ ...meta, data: meta.data ?? 0 }), col);
    }
    return known ? index.fields.get(fieldKey(field)) : index.names.get(name);
  };
}
