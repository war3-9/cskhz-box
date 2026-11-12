import { useState } from 'react';
import { Modal } from '../shared/components/Modal';
import licenseText from '../../LICENSE?raw';

export function UsageLicense() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="text-button" onClick={() => setOpen(true)}>免费使用 · 禁止收费 · 许可条款</button>
    {open && <Modal title="源码公开免费许可" close={() => setOpen(false)}>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '55vh', overflow: 'auto', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>{licenseText}</pre>
    </Modal>}
  </>;
}
