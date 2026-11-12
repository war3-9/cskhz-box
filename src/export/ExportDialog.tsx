import { StyledSelect } from '../shared/components/StyledSelect';
import { useState } from "react";
import { Modal } from "../shared/components/Modal";
import { useEditor } from "../layers/store";
import { useUi } from "../app/uiStore";
import { renderDocument } from "./render";
import type { BatchFormat } from "./batchConfig";
import { blpSizes, blpDimensions } from "./gameFormats/settings";
import { saveArtwork } from "./saveArtwork";
import { defaultIconPairOptions, validateIconPairs } from './iconPairs/config';
import { IconPairFields } from './iconPairs/Fields';
import { IconPairToggle } from './iconPairs/Toggle';
import { useIconPairDirectory } from './iconPairs/useDirectory';
import { saveSingleIconPair } from './iconPairs/export';
import { BatchDirectoryField } from './BatchDirectoryField';
import { isTauri } from '@tauri-apps/api/core';
import { useOutputFolder, outputFolderError } from './outputFolder';
import { OutputFolderField } from './OutputFolderField';
import './batch.css';
import './single.css';
export function ExportDialog({ close }: { close: () => void }) {
  const document = useEditor((s) => s.document);
  const [ordinaryFormat, setFormat] = useState<BatchFormat>("png");
  const [iconPairs, setIconPairs] = useState(defaultIconPairOptions);
  const [directory, setDirectory] = useState(isTauri() ? '' : '浏览器下载目录');
  const { folder, setFolder } = useOutputFolder();
  const pairDirectory = useIconPairDirectory(iconPairs.enabled, directory);
  const format = iconPairs.enabled ? 'blp' : ordinaryFormat;
  const [quality, setQuality] = useState(0.95);
  const [blpSize, setBlpSize] = useState(0);
  const outputSize =
    format === "blp"
      ? blpDimensions(document.width, document.height, blpSize)
      : document;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pairError = iconPairs.enabled ? validateIconPairs(iconPairs) || pairDirectory.error || (!directory ? '请选择保存地址' : '') : (!directory ? '请选择保存地址' : outputFolderError(folder));
  return (
    <Modal
      title="导出作品"
      className="batch-modal single-export-modal"
      dismissDisabled={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="export-summary">
        <span>{document.name}</span>
        <small>
          {outputSize.width} × {outputSize.height} px
        </small>
      </div>
      <div className="single-export-body"><fieldset disabled={busy}>
      <div className="single-export-format">
        <div className="single-export-format-heading">
          <label htmlFor="single-export-format">图片格式</label>
          <IconPairToggle enabled={iconPairs.enabled}
            update={enabled => { setIconPairs({ ...iconPairs, enabled }); setError(''); }} />
        </div>
        <StyledSelect
          id="single-export-format"
          value={format}
          disabled={busy || iconPairs.enabled}
          onChange={(e) => setFormat(e.target.value as BatchFormat)}
        >
          {!iconPairs.enabled && <><option value="png">PNG · 透明背景</option>
          <option value="jpeg">JPG · 白色背景</option>
          <option value="tga">TGA · 32 位透明</option></>}
          <option value="blp">BLP1 · 魔兽争霸 · 256 色</option>
        </StyledSelect>
      </div>
      {iconPairs.enabled && <IconPairFields options={iconPairs} update={setIconPairs} />}
      {format === "blp" && (
        <label>
          BLP 尺寸
          <StyledSelect
            aria-label="BLP 尺寸"
            value={blpSize}
            disabled={busy}
            onChange={(event) => setBlpSize(Number(event.target.value))}
          >
            <option value="0">自动（按画布取整）</option>
            {blpSizes.map((size) => (
              <option key={size} value={size}>
                {size} × {size}
              </option>
            ))}
          </StyledSelect>
        </label>
      )}
      {format === "jpeg" && (
        <label>
          图片质量 {Math.round(quality * 100)}%
          <input
            aria-label="图片质量"
            type="range"
            min=".5"
            max="1"
            step=".01"
            value={quality}
            disabled={busy}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </label>
      )}
      <BatchDirectoryField directory={directory} paired={iconPairs.enabled}
        setDirectory={selected => { setDirectory(selected); pairDirectory.retry(); setError(''); }} reportError={setError} />
      {!iconPairs.enabled && !!directory && <OutputFolderField value={folder} update={setFolder} />}
      {iconPairs.enabled && <p className="single-pair-summary">1 个图标，共导出 2 个 BLP 文件</p>}
      </fieldset>
      {pairDirectory.preparing && <p role="status">正在创建光暗图标目录…</p>}
      {(error || pairError) && (
        <p className="error-text" role="alert">
          {error || pairError}
        </p>
      )}
      <div className="dialog-actions">
        <button disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="primary"
          disabled={busy || pairDirectory.preparing || !!pairError || !document.layers.some((l) => l.visible)}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (iconPairs.enabled) {
                await saveSingleIconPair(structuredClone(document), { ...iconPairs }, directory, blpSize);
                close();
                useUi.getState().notify('已导出 1 对图标，共 2 个 BLP 文件');
                return;
              }
              const blob = await renderDocument(document, format, quality, {
                blpSize,
              });
              if (!(await saveArtwork(blob, document.name, format, { directory, subdirectory: folder }))) return;
              close();
              useUi.getState().notify("作品已导出");
            } catch (error) {
              setError(
                `导出失败：${error instanceof Error ? error.message : String(error)}。请检查保存地址和文件权限后重试。`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "导出中…" : iconPairs.enabled ? '导出光暗图标' : "导出图片"}
        </button>
      </div>
      </div>
    </Modal>
  );
}
