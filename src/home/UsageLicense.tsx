import { useState } from 'react';
import { Modal } from '../shared/components/Modal';
import licenseText from '../../LICENSE?raw';

export function UsageLicense() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="text-button" onClick={() => setOpen(true)}>AGPLv3 · 许可与源码</button>
    {open && <Modal title="AGPLv3 许可与对应源码" close={() => setOpen(false)}>
      <p>Copyright (C) 2026 war3-9 · AGPL-3.0-only</p>
      <p>允许商业使用和收费分发；分发及修改版网络服务须按协议提供对应源码。程序按现状提供，不作担保。</p>
      <p>1.1.2 对应源码与构建说明：复制以下地址到浏览器打开。</p>
      <input aria-label="对应源码地址" readOnly value="https://github.com/war3-9/cskhz-box/tree/v1.1.2-agpl.1" onFocus={(event) => event.currentTarget.select()} style={{ width: '100%' }} />
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '55vh', overflow: 'auto', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>{licenseText}</pre>
    </Modal>}
  </>;
}
