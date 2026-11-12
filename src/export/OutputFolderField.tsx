import { isTauri } from '@tauri-apps/api/core';
import { BatchField } from './BatchHelp';
import { outputFolderError } from './outputFolder';
export function OutputFolderField({ value, update }: { value: string; update: (value: string) => void }) {
  const error = outputFolderError(value);
  return <BatchField label="导出路径" id="icon-output-folder" help="在所选保存地址内创建此名称的文件夹，普通图片输出到其中。末尾的反斜杠可保留；单个和批量导出共用设置。">
    <input id="icon-output-folder" aria-label="导出路径" value={value} maxLength={101} onChange={event => update(event.target.value)} aria-invalid={!!error} />
    {error && <small className="error-text" role="alert">{error}</small>}
    {!isTauri() && <small>浏览器下载无法创建子目录；在桌面版中会创建此文件夹。</small>}
  </BatchField>;
}
