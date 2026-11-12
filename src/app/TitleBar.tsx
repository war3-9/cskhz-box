import { ArrowRightLeft, Crop, Download, House, ListChecks, Settings } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { WindowChrome } from './WindowChrome';
import { ProjectToolbar } from '../project/ProjectToolbar';
import { IconButton } from '../shared/components/IconButton';
import { BatchExportDialog } from '../export/BatchExportDialog';
import { SettingsPanel } from '../settings/SettingsPanel';
import { AiStatusBadge } from '../settings/AiStatusBadge';
import { useTasks } from '../tasks/store';
import { ConversionDialog } from '../image-converter/ConversionDialog';
import { CropDialog } from '../image-crop/CropDialog';
import { WorkspaceRecoveryDialog } from '../project/WorkspaceRecoveryDialog';
import { useWorkspaceRecovery, showWorkspaceRecovery } from '../project/recovery';
export function TitleBar({ home = false, viewer = false, exportArtwork, goHome, featureSettings, featureSettingsLabel = 'UI 设置', featureActions }: { home?: boolean; viewer?: boolean; exportArtwork?: () => void; goHome?: () => void; featureSettings?: () => void; featureSettingsLabel?: string; featureActions?: ReactNode }) {
  const [showBatch, setShowBatch] = useState(false), [showSettings, setShowSettings] = useState(false);
  const [showConversion, setShowConversion] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const activeId = useTasks(s => s.activeId);
  const recoveryOpen = useWorkspaceRecovery(s => s.open);
  return <><WindowChrome home={home}>
    {!home && <IconButton label="返回首页" onClick={goHome}><House size={18} /></IconButton>}
    {!home && featureSettings && <IconButton label={featureSettingsLabel} onClick={featureSettings}><Settings size={18} /></IconButton>}
    {!home && featureActions}
    {!home && !viewer && <><IconButton label="设置" onClick={() => setShowSettings(true)}><Settings size={18} /></IconButton><AiStatusBadge /><span className="top-divider" />
      <button className="text-button" title="批量导出" aria-label="批量导出" onClick={() => setShowBatch(true)}><ListChecks size={18} />批量导出</button>
      <button className="text-button" title="格式转换" aria-label="格式转换" onClick={() => setShowConversion(true)}><ArrowRightLeft size={18} />格式转换</button><button className="text-button" aria-label="裁剪图片" onClick={() => setShowCrop(true)}><Crop size={18} />裁剪图片</button><ProjectToolbar />
      <button className="text-button" title="导出作品" aria-label="导出作品" disabled={!activeId} onClick={exportArtwork}><Download size={18} />导出作品</button><button className="text-button" onClick={showWorkspaceRecovery}>恢复工作区</button></>}
  </WindowChrome>{recoveryOpen && <WorkspaceRecoveryDialog />}{showBatch && <BatchExportDialog close={() => setShowBatch(false)} />}{showSettings && <SettingsPanel close={() => setShowSettings(false)} />}{showConversion && <ConversionDialog close={() => setShowConversion(false)} />}{showCrop && <CropDialog close={() => setShowCrop(false)} />}</>;
}
