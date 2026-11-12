import { useState } from 'react';
import { ObjectModal } from './Modal';
export function BatchDialog({ add, cancel }: { add: (count: number) => void; cancel: () => void }) {
  const [count, setCount] = useState('10'), n = Number(count), valid = Number.isInteger(n) && n >= 1 && n <= 2000;
  return <ObjectModal title="批量添加" close={cancel} className="ot-batch-dialog"><form onSubmit={e => { e.preventDefault(); if (valid) add(n); }}><label>添加行数<input type="number" aria-label="添加行数" min={1} max={2000} value={count} onChange={e => setCount(e.target.value)} /></label><p className="ot-dialog-hint">在选中区域下方添加，可一次撤销。每次 1～2000 行。</p><footer><button type="button" className="ot-button" onClick={cancel}>取消</button><button type="submit" className="ot-button ot-primary" disabled={!valid}>添加</button></footer></form></ObjectModal>;
}
