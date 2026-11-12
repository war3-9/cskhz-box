import { useRef, type ReactNode } from 'react';
import { ImagePlus, ImageOff, Scan } from 'lucide-react';
import { useCanvasView, type ViewToggle } from './view';
import { useLayoutStore } from '../state/layout';
import { useUiTasks } from '../tasks/store';

const toggles: [ViewToggle, string][] = [
  ['grid', '显示网格'], ['snap', '吸附'], ['boundary', '边界'], ['hiddenFrames', '隐藏框'],
  ['guides', '辅助线'], ['highlight', '高亮'], ['selection', '选中框'],
];
export function CanvasToolbar({ scale, saveControl }: { scale: number; saveControl?: ReactNode }) {
  const view = useCanvasView();
  const background = useLayoutStore(state => state.background);
  const fileInput = useRef<HTMLInputElement>(null);
  return <div className="canvas-toolbar" aria-label="画布工具">
    <div className="view-toggles">{toggles.map(([key, label]) => <label key={key} className="view-toggle">
      <input type="checkbox" checked={view[key]} onChange={event => useCanvasView.setState({ [key]: event.target.checked })} />{label}
    </label>)}</div>
    <div className="zoom-tools"><label className="zoom-label">缩放<input aria-label="画布缩放" type="number" min={10} max={200}
      value={Math.round(scale * 100)} onChange={event => {
        const value = Number(event.target.value);
        if (value >= 10 && value <= 200) useCanvasView.setState({ zoom: value / 100 });
      }} /><span>%</span></label>
      <button title="适应画布并居中" aria-label="适应画布" onClick={() => useCanvasView.setState({ zoom: null, panX: 0, panY: 0 })}><Scan size={17} /></button>
      <button className="command" title="选择参考背景" onClick={() => fileInput.current?.click()}><ImagePlus size={16} />选择背景</button>
      <button title="清除背景" aria-label="清除背景" disabled={!background} onClick={() => useLayoutStore.getState().setBackground(null)}><ImageOff size={17} /></button>
    </div>
    {saveControl}
    <input hidden ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" data-testid="canvas-background" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
      const reader = new FileReader();
      const taskId = useUiTasks.getState().activeId;
      reader.onload = () => { if (useUiTasks.getState().activeId === taskId) useLayoutStore.getState().setBackground(String(reader.result)); };
      reader.readAsDataURL(file);
    }} />
  </div>;
}
