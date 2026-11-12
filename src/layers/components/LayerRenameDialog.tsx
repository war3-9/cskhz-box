import { useEffect, useState } from 'react';
import type { ImageLayer } from '../../shared/types';
import { Modal } from '../../shared/components/Modal';
import { useTasks } from '../../tasks/store';
import { useEditor } from '../store';

export function LayerRenameDialog({ layer, close }: { layer: ImageLayer; close: () => void }) {
  const [name, setName] = useState(layer.name);
  const taskId = useTasks(state => state.activeId);
  const [originalTask] = useState(taskId);
  const current = useEditor(state => state.document.layers.find(item => item.id === layer.id));
  const stale = !current || taskId !== originalTask;
  useEffect(() => { if (stale) close(); }, [stale, close]);
  return <Modal title="重命名图层" close={close} className="layer-rename-dialog">
    <form onSubmit={event => {
      event.preventDefault();
      if (stale || !name.trim() || name.trim().length > 200) return;
      useEditor.getState().updateLayer(layer.id, { name: name.trim() });
      close();
    }}>
      <label htmlFor="layer-rename-name">图层名称</label>
      <input id="layer-rename-name" value={name} maxLength={200} autoFocus
        onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)} />
      <p>修改后，批量导出的图层选项也会显示此名称。</p>
      <div className="dialog-actions"><button type="button" onClick={close}>取消</button>
        <button type="submit" className="primary" disabled={stale || !name.trim()}>确定</button></div>
    </form>
  </Modal>;
}
