import { StyledSelect } from '../shared/components/StyledSelect';
import { useRef, useState } from 'react';
import { ArrowRightLeft, CircleCheck, FileImage, FolderOpen } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { Modal } from '../shared/components/Modal';
import {
  conversionFormats, convertImages, openConversionDirectory, selectConversionSource,
  type ConversionFormat, type ConversionProgress, type ConversionResult, type ConversionSource, type ConversionSize,
} from './service';
import './converter.css';

export function ConversionDialog({ close }: { close: () => void }) {
  const [source, setSource] = useState<ConversionSource | null>(null);
  const [format, setFormat] = useState<ConversionFormat>('png');
  const [size, setSize] = useState<ConversionSize>(0);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const stopped = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);

  const choose = async (folder: boolean) => {
    setChoosing(true);
    setError('');
    try {
      const selected = await selectConversionSource(folder);
      if (selected) {
        setSource(selected);
        if (!selected.files.length) setError('所选文件夹中没有 BLP、TGA、PNG 或 JPG 图片。');
      }
    } catch (cause) { setError(String(cause)); }
    finally { setChoosing(false); }
  };
  const run = async () => {
    if (busy || !source?.files.length) return;
    setBusy(true);
    setError('');
    stopped.current = false;
    setStopRequested(false);
    try { setResult(await convertImages(source, format, setProgress, () => stopped.current, size)); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };

  if (result) return <Modal
    title={result.stopped ? '已停止转换' : !result.succeeded ? '转换失败' : result.failed.length ? '转换完成' : '转换成功'}
    close={close} className="image-conversion-dialog"
  >
    <div className="conversion-result">
      {result.succeeded > 0 && <CircleCheck size={32} className="conversion-success-icon" />}
      <p role="status">已成功转换 {result.succeeded} 张图片{result.failed.length > 0 ? `，失败 ${result.failed.length} 张` : ''}。</p>
      {result.stopped && <p>共选择 {result.total} 张，未处理的图片可以重新选择后转换。</p>}
      {result.succeeded > 0 && <p className="conversion-path">{result.outputDirectory}</p>}
      {result.failed.length > 0 && <details><summary>查看失败原因</summary><ul>
        {result.failed.map((item, index) => <li key={index}><strong>{item.name}</strong>：{item.error}</li>)}
      </ul></details>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={() => { setResult(null); setProgress(null); setError(''); }}>继续转换</button>
        <button type="button" onClick={close}>关闭</button>
        {result.succeeded > 0 && <button type="button" className="primary" onClick={async () => {
          try { await openConversionDirectory(result.outputDirectory); }
          catch (cause) { setError(String(cause)); }
        }}><FolderOpen size={16} />打开目录</button>}
      </div>
    </div>
  </Modal>;

  return <Modal title="格式转换" close={close} className="image-conversion-dialog" dismissDisabled={busy || choosing}>
    <form onSubmit={event => { event.preventDefault(); void run(); }}>
      <p className="conversion-intro">将电脑上的 BLP、TGA、PNG、JPG 图片转换为所需格式。</p>
      <fieldset disabled={busy || choosing}>
        <div className="conversion-source-actions">
          <button type="button" className="secondary" disabled={!isTauri()} onClick={() => void choose(false)}><FileImage size={17} />选择单个文件</button>
          <button type="button" className="secondary" disabled={!isTauri()} onClick={() => void choose(true)}><FolderOpen size={17} />选择文件夹</button>
        </div>
        {!isTauri() && <p className="conversion-hint">请在桌面版中选择电脑上的图片。</p>}
        {source && <div className="conversion-selection">
          <span className="conversion-path">{source.files.length === 1 ? source.files[0].path : source.directory}</span>
          <span>已选择 {source.files.length} 张图片</span>
        </div>}
        <label>转换为<StyledSelect aria-label="转换目标格式" value={format} onChange={event => setFormat(event.target.value as ConversionFormat)}>
          {conversionFormats.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}
        </StyledSelect></label>
        <label>输出分辨率<StyledSelect aria-label="转换输出分辨率" value={size} onChange={event => setSize(Number(event.target.value) as ConversionSize)}><option value={0}>保持原尺寸</option><option value={64}>64 × 64</option><option value={128}>128 × 128</option></StyledSelect></label>
      </fieldset>
      <p className="conversion-hint">文件夹模式处理当前层级的图片。结果保存到“转换图片”子文件夹，保留原文件；同名结果自动添加序号。</p>
      {format === 'blp' && <p className="conversion-hint">BLP 同时生成光图和60%亮度暗图，保存到转换图片/ReplaceableTextures 下的 CommandButtons、CommandButtonsDisabled 文件夹。保持原尺寸时宽高调整到最近的较大2的幂。</p>}
      {format === 'jpg' && <p className="conversion-hint">JPG 不支持透明度，透明区域将使用白色背景。</p>}
      {source && <p className="conversion-path conversion-hint">保存位置：{source.outputDirectory}</p>}
      {busy && progress && <div className="conversion-progress" role="status">
        <span>{stopRequested ? '正在停止，等待当前图片完成…' : `正在转换：${progress.name}`}</span>
        <progress value={progress.done} max={progress.total} />
        <span>{progress.done} / {progress.total} 张图片</span>
      </div>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="dialog-actions">
        {busy && <button type="button" disabled={stopRequested} onClick={() => { stopped.current = true; setStopRequested(true); }}>停止</button>}
        <button type="button" disabled={busy || choosing} onClick={close}>取消</button>
        <button className="primary" disabled={busy || choosing || !source?.files.length}>
          <ArrowRightLeft size={16} />{choosing ? '读取中…' : busy ? '转换中…' : '开始转换'}
        </button>
      </div>
    </form>
  </Modal>;
}
