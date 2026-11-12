import { Copy, Minus, Square, ThumbsUp, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { IconButton } from '../shared/components/IconButton';
import { Modal } from '../shared/components/Modal';
import { useDesktopWindow } from './useDesktopWindow';
import { requestApplicationClose } from './CloseDialog';
import brandLogo from '../assets/brand-logo.png';
import appreciationCode from '../../素材/赞赏码.png';
import './titlebar.css';
import '../shared/dialog.css';
import { ThemeToggle } from './theme/ThemeToggle';
import { appVersion } from '../update/version';

export function WindowChrome({ children, home }: { children?: ReactNode; home?: boolean }) {
  const { desktop, maximized, run } = useDesktopWindow();
  const [showAppreciation, setShowAppreciation] = useState(false);
  const isDragTarget = (target: EventTarget) => target instanceof Element && !target.closest('button,input,select,a');
  return <><header className={`topbar${home ? ' topbar-home' : ''}`} onMouseDown={event => {
    if (event.button === 0 && event.detail === 1 && isDragTarget(event.target)) void run('startDragging');
  }} onDoubleClick={event => { if (event.button === 0 && isDragTarget(event.target)) void run('toggleMaximize'); }}>
    <div className="brand"><img className="brand-logo" src={brandLogo} alt="" /><span><strong>超时空盒子</strong><span className="home-version">v{appVersion}</span></span></div>
    <div className="top-actions">{children}{home && <button type="button" className="appreciation-button" onClick={() => setShowAppreciation(true)}><ThumbsUp size={16} aria-hidden="true" />赞赏</button>}<ThemeToggle /><div className="window-controls" aria-label="窗口控制">
      <IconButton label="最小化" disabled={!desktop} onClick={() => void run('minimize')}><Minus size={18} /></IconButton>
      <IconButton label={maximized ? '还原窗口' : '最大化'} disabled={!desktop} onClick={() => void run('toggleMaximize')}>{maximized ? <Copy size={16} /> : <Square size={16} />}</IconButton>
      <IconButton label="关闭窗口" className="icon-button window-close" disabled={!desktop} onClick={requestApplicationClose}><X size={18} /></IconButton>
    </div></div>
  </header>{showAppreciation && <Modal title="赞赏" close={() => setShowAppreciation(false)} className="appreciation-dialog"><img src={appreciationCode} alt="赞赏码" /></Modal>}</>;
}
