import { FolderOpen } from 'lucide-react';
import { BatchField } from './BatchHelp';
import { selectOutputDirectory } from './batchIO';

interface Props {
  directory: string;
  setDirectory: (value: string) => void;
  reportError: (value: string) => void;
  paired?: boolean;
}
export function BatchDirectoryField({ directory, setDirectory, reportError, paired }: Props) {
  return <BatchField label="保存地址" id="batch-directory"
    help={paired ? '选择根目录后自动创建 ReplaceableTextures 及两个子目录。正常与暗图成对输出，任一文件名被占用就一起跳过该序号。生成光暗图标需使用桌面版。' : '桌面版选择输出文件夹，已有文件不会覆盖。浏览器版由浏览器下载设置决定保存位置，多文件下载可能需要浏览器授权。'}>
    <div className="batch-file-row">
      <button id="batch-directory" aria-label="选择目录" type="button" onClick={async () => {
        try { const selected = await selectOutputDirectory(); if (selected) setDirectory(selected); }
        catch (error) { reportError(String(error)); }
      }}><FolderOpen size={16} />选择目录</button>
      <span title={directory}>{directory || '未选择'}</span>
    </div>
  </BatchField>;
}
