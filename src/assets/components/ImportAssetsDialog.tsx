import { StyledSelect } from '../../shared/components/StyledSelect';
import { useEffect, useRef, useState } from "react";
import { Files, FolderOpen, X } from "lucide-react";
import { useLibrary } from "../store";
import { Modal } from "../../shared/components/Modal";
import { useUi } from "../../app/uiStore";
import { CategoryDialog } from "./CategoryDialog";
import { isUserAssetCategory } from "../userCategories";
import { filterImportableImages, importAssetFiles } from "../importFiles";
import { folderBinding } from '../folders';
export function ImportAssetsDialog({ close }: { close: () => void }) {
  const { library, activeCategory, addAssets } = useLibrary();
  const options = library.categories.filter((c) =>
    isUserAssetCategory(c, library.categories) && !folderBinding(c.id),
  );
  const [categoryId, setCategory] = useState(
    options.some((c) => c.id === activeCategory)
      ? activeCategory
      : (options[0]?.id ?? ""),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function selectImages(input: HTMLInputElement) {
    const selected = filterImportableImages(Array.from(input.files ?? []));
    setFiles(selected);
    setName("");
    if (selected.length === 0 && input.files?.length)
      useUi.getState().notify("所选内容中没有 PNG 或 JPG 图片。", "error");
    input.value = "";
  }

  return (
    <Modal title="导入素材" close={close} dismissDisabled={busy}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (operation.current) return;
          const controller = new AbortController();
          operation.current = controller;
          setBusy(true);
          setCompleted(0);
          try {
            if (useLibrary.getState().library.assets.length + files.length > 5000)
              throw new Error('素材库最多支持 5000 张素材，请先减少素材。');
            const assets = await importAssetFiles(files, { signal: controller.signal, onProgress: setCompleted });
            if (assets.length === 1 && name.trim())
              assets[0].name = name.trim();
            addAssets(assets, categoryId);
            useLibrary.getState().select(categoryId);
            close();
            useUi.getState().notify(`已导入 ${assets.length} 张素材`);
          } catch (error) {
            if (controller.signal.aborted) useUi.getState().notify('已取消导入，素材库未改变。');
            else useUi.getState().notify(String(error), "error");
          } finally {
            operation.current = null;
            setBusy(false);
          }
        }}
      >
        <label>
          目标小分类
          <StyledSelect
            disabled={busy}
            value={categoryId}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">选择小分类</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {library.categories.find((g) => g.id === c.parentId)?.name} /{" "}
                {c.name}
              </option>
            ))}
          </StyledSelect>
        </label>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => setCreate(true)}
        >
          新建大分类 / 小分类
        </button>
        <div className="import-source">
          <span>素材图片</span>
          <div className="import-source-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => filesInput.current?.click()}
              disabled={busy}
            >
              <Files size={15} /> 选择文件
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => folderInput.current?.click()}
              disabled={busy}
            >
              <FolderOpen size={15} /> 选择文件夹
            </button>
          </div>
          <input
            ref={filesInput}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg"
            aria-label="选择素材图片文件"
            onChange={(e) => selectImages(e.currentTarget)}
          />
          <input
            ref={folderInput}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg"
            {...({ webkitdirectory: "" } as Record<string, string>)}
            aria-label="选择素材图片文件夹"
            onChange={(e) => selectImages(e.currentTarget)}
          />
          <div className="import-selection" aria-live="polite">
            <span>
              {files.length
                ? `已选择 ${files.length} 张图片`
                : "支持 PNG、JPG，可一次导入整个文件夹"}
            </span>
            {files.length > 0 && (
              <button
                type="button"
                className="text-button"
                aria-label="清空已选图片"
                disabled={busy}
                onClick={() => {
                  setFiles([]);
                  setName("");
                }}
              >
                <X size={14} /> 清空
              </button>
            )}
          </div>
        </div>
        {files.length === 1 && (
          <label>
            素材名称
            <input
              maxLength={100}
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={files[0].name.replace(/\.[^.]+$/, "")}
            />
          </label>
        )}
        {busy && <div className="import-progress" role="status" aria-live="polite">
          <progress max={files.length} value={completed} />
          <span>正在导入 {completed} / {files.length} 张</span>
        </div>}
        <div className="dialog-actions">
          <button type="button" onClick={() => busy ? operation.current?.abort() : close()}>
            {busy ? '取消导入' : '取消'}
          </button>
          <button
            className="primary"
            disabled={!categoryId || !files.length || busy}
          >
            {busy ? "导入中…" : "导入素材"}
          </button>
        </div>
      </form>
      {create && <CategoryDialog close={() => setCreate(false)} />}
    </Modal>
  );
}
