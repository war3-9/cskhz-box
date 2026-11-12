import { Modal } from '../../shared/components/Modal';
import type { TaskActions } from './useTaskActions';

export function TaskDialogs({ actions }: { actions: TaskActions }) {
  if (actions.naming) return <Modal title="保存 UI 设计" close={actions.cancel} className="ui-design-dialog">
    <form onSubmit={event => { event.preventDefault(); actions.confirmName(); }}>
      <label>设计名称<input autoFocus aria-label="设计名称" maxLength={100} value={actions.name} disabled={actions.busy} onChange={event => actions.setName(event.target.value)} /></label>
      {actions.error && <p role="alert" className="ui-unsaved">{actions.error}</p>}
      <div className="dialog-actions"><button type="button" disabled={actions.busy} onClick={actions.cancel}>取消</button>
        <button className="primary" disabled={actions.busy || !actions.name.trim()} type="submit">{actions.busy ? '保存中…' : '确认保存'}</button></div>
    </form>
  </Modal>;
  return actions.guard && <Modal title="当前任务未保存" close={actions.cancel} className="ui-design-dialog">
    <p className="ui-unsaved">{actions.guard.kind === 'close' ? '当前任务尚未保存，是否保存后关闭？' : '当前任务尚未保存，请保存后再切换。'}</p>
    {actions.guard.kind === 'close' && <p>不保存并关闭会放弃本次未保存的修改，已有保存稿仍会保留。</p>}
    {actions.error && <p role="alert" className="ui-unsaved">{actions.error}</p>}
    <div className="dialog-actions"><button disabled={actions.busy} onClick={actions.cancel}>取消</button>
      {actions.guard.kind === 'close' && <button disabled={actions.busy} onClick={actions.discardGuard}>不保存并关闭</button>}
      <button className="primary" disabled={actions.busy} onClick={actions.saveGuard}>{actions.busy ? '保存中…' : actions.guard.kind === 'close' ? '保存并关闭' : '保存并继续'}</button></div>
  </Modal>;
}
