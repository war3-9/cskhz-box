import { StyledSelect } from '../../shared/components/StyledSelect';
import { useState } from "react";
import { useLibrary } from "../store";
import { Modal } from "../../shared/components/Modal";
import { importImage } from "../../shared/image";
import { useUi } from "../../app/uiStore";
import type { Category } from "../../shared/types";
import { folderBinding } from '../folders';

export function CategoryDialog({
  close,
  edit,
  parentId: initialParent,
}: {
  close: () => void;
  edit?: Category;
  parentId?: string;
}) {
  const { library, addCategory, renameCategory } = useLibrary();
  const [name, setName] = useState(edit?.name ?? "");
  const [parentId, setParent] = useState(edit?.parentId ?? initialParent ?? "");
  const [thumbnail, setThumbnail] = useState(edit?.thumbnail ?? "");
  const [busy, setBusy] = useState(false);
  const groups = library.categories.filter(
    (c) => !c.parentId && c.source === "user" && !folderBinding(c.id),
  );
  const duplicates = library.categories.some(
    (c) =>
      c.id !== edit?.id &&
      c.name === name.trim() &&
      c.parentId === (parentId || null),
  );
  return (
    <Modal title={edit ? "编辑分类" : "新建分类"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || duplicates || busy) return;
          if (edit) renameCategory(edit.id, name, thumbnail);
          else addCategory(name, parentId || null, thumbnail);
          close();
        }}
      >
        <label>
          分类名称
          <input
            required
            maxLength={60}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入分类名称"
          />
        </label>
        {!edit && (
          <label>
            所属大分类
            <StyledSelect
              value={parentId}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">新建大分类</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </StyledSelect>
          </label>
        )}
        <label>
          分类缩略图
          <input
            type="file"
            accept="image/png,image/jpeg"
            aria-label="分类缩略图"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                setThumbnail((await importImage(file)).thumbnailPath);
              } catch (error) {
                useUi.getState().notify(String(error), "error");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {thumbnail && (
          <img className="dialog-thumbnail" src={thumbnail} alt="分类缩略图" />
        )}
        {duplicates && <p className="error-text">该分类名称已存在。</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            取消
          </button>
          <button
            className="primary"
            disabled={!name.trim() || duplicates || busy}
          >
            {edit ? "保存" : "创建分类"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
