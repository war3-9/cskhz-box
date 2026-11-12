import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colorRange, presets } from './colorCodes';
import { previewCode, previewSelection, renderPreview } from './richText';
import { useEditorHeights } from '../palette/useEditorHeights';

interface Props { value: string; savedValue?: string; save: (value: string) => void; change?: (value: string) => void; title?: string }
type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> };
export function ColorDialog({ value, savedValue = value, save, change, title }: Props) {
  const [code, setCode] = useState(value), [color, setColor] = useState('|cff8694fe'), [message, setMessage] = useState('');
  const { preview, source, previewHeight, sourceHeight } = useEditorHeights();
  const range = useRef<[number, number]>([0, 0]), fromPreview = useRef(false);
  const latest = useRef(value);
  useEffect(() => { const error = (event: Event) => setMessage((event as CustomEvent<string>).detail); window.addEventListener('object-preference-error', error); return () => window.removeEventListener('object-preference-error', error); }, []);
  const updateCode = (update: string | ((current: string) => string)) => { const next = typeof update === 'function' ? update(latest.current) : update; latest.current = next; setCode(next); change?.(next); };
  useEffect(() => { latest.current = value; setCode(value); }, [value]);
  useLayoutEffect(() => { if (!fromPreview.current) renderPreview(preview.current!, code); fromPreview.current = false; }, [code]);
  useEffect(() => {
    const capture = () => { const selected = previewSelection(preview.current!); if (selected) range.current = selected; };
    document.addEventListener('selectionchange', capture); return () => document.removeEventListener('selectionchange', capture);
  }, []);
  const apply = (next?: string) => {
    setMessage(''); const match = (next ?? color).match(/^(?:\|c|#)?([\da-f]{8}|[\da-f]{6})$/i);
    if (!match) { setMessage('颜色代码格式：|cff8694fe 或 #8694fe'); return; }
    const hex = match[1].length === 6 ? 'ff' + match[1] : match[1]; setColor('|c' + hex.toLowerCase());
    updateCode(current => colorRange(current, ...range.current, hex.toLowerCase()));
  };
  const sample = async () => {
    const Dropper = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!Dropper) { setMessage('当前桌面内核不支持屏幕取色，请使用其他颜色或输入颜色代码。'); return; }
    try { const picked = await new Dropper().open(); apply(picked.sRGBHex); } catch (error) { if ((error as Error).name !== 'AbortError') setMessage('屏幕取色失败：' + String(error)); }
  };
  return <div className="ot-color-dialog" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.key === 'Enter')) { e.preventDefault(); save(code); } }}>
      {title && <p className="ot-palette-binding" title={title}>{title}</p>}
      <div className="ot-color-tools"><div className="ot-swatches">{presets.map(hex => <button key={hex} title={'#' + hex} aria-label={'应用颜色 #' + hex} style={{ background: '#' + hex }} onPointerDown={e => e.preventDefault()} onClick={() => apply(hex)} />)}</div>
        <label className="ot-button ot-custom-color">其他颜色<input aria-label="其他颜色" type="color" value={'#' + (color.match(/[\da-f]{6}$/i)?.[0] ?? '8694fe')} onChange={e => apply(e.target.value)} /></label>
        <button className="ot-button" onClick={() => void sample()}>屏幕取色</button>
      </div>
      <div className="ot-color-code"><label>颜色代码<input aria-label="颜色代码" value={color} onChange={e => setColor(e.target.value)} /></label><button className="ot-button" onClick={() => apply()}>应用颜色</button><button className="ot-button" onClick={() => updateCode(current => colorRange(current, ...range.current))}>移除颜色</button></div>
      <label className="ot-editor-label" id="ot-preview-label">文字预览（可直接编辑）</label>
      <div ref={preview} style={{ height: previewHeight }} data-autofocus className="ot-color-preview" contentEditable suppressContentEditableWarning role="textbox" aria-labelledby="ot-preview-label" aria-multiline="true" onInput={() => { fromPreview.current = true; updateCode(previewCode(preview.current!)); }} onPaste={e => {
        e.preventDefault(); const selection = window.getSelection(); if (!selection?.rangeCount) return;
        const selected = selection.getRangeAt(0); selected.deleteContents(); const node = document.createTextNode(e.clipboardData.getData('text/plain')); selected.insertNode(node); selected.setStartAfter(node); selected.collapse(true); selection.removeAllRanges(); selection.addRange(selected);
        fromPreview.current = true; updateCode(previewCode(preview.current!));
      }} />
      <label className="ot-editor-label" htmlFor="ot-color-source">代码模式（保留 |c、|r、|n 标记）</label>
      <textarea ref={source} style={{ height: sourceHeight }} id="ot-color-source" aria-label="编辑单元格" value={code} onChange={e => { range.current = [0, 0]; updateCode(e.target.value); }} spellCheck={false} />
      {message && <p className="ot-dialog-hint" role="status">{message}</p>}
      <footer><small>选中文字调色 · Ctrl+Enter 应用</small><button className="ot-button" onClick={() => updateCode(savedValue)}>还原</button><button className="ot-button ot-primary" onClick={() => save(code)}>保存</button></footer>
  </div>;
}
