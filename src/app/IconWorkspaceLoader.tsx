import { useEffect, useState } from 'react';
import { initializeWorkspace } from '../project/persistence';
import { EditorWorkspace } from './EditorWorkspace';
import { TitleBar } from './TitleBar';
import './workspace-loading.css';
import { useWorkspaceRecovery } from '../project/recovery';
import { useUi } from './uiStore';

export function IconWorkspaceLoader({ active, goHome }: { active: boolean; goHome: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    void initializeWorkspace().then(() => {
      if (!disposed) setReady(true);
    }).catch(reason => {
      useWorkspaceRecovery.setState({ protected: true, issues: ['工作区初始化未完成，原自动恢复记录暂停覆盖：' + String(reason)] });
      useUi.getState().notify('工作区初始化异常，可继续使用并另存工程；请从“恢复工作区”保全原数据。', 'error');
      if (!disposed) setReady(true);
    });
    return () => { disposed = true; };
  }, []);
  if (ready) return <EditorWorkspace active={active} goHome={goHome} />;
  return <>
    <TitleBar viewer goHome={goHome} />
    <main className="workspace-loading" aria-label="图标制作工作区" aria-busy="true">
      <div className="workspace-loading-placeholder" aria-hidden="true"><div /><div><span /></div><div /></div>
      <div className="workspace-loading-overlay">
        <div className="workspace-loading-status" role="status">
          <span className="workspace-loading-spinner" aria-hidden="true" />
          <p>正在加载工作区！</p>
        </div>
      </div>
    </main>
  </>;
}
