import { StyledSelect } from '../../shared/components/StyledSelect';
import { useState } from "react";
import { useLibrary } from "../store";
import { Modal } from "../../shared/components/Modal";
import type { Category } from "../../shared/types";
export function DeleteCategoryDialog({
  category,
  close,
}: {
  category: Category;
  close: () => void;
}) {
  const { library, deleteCategory } = useLibrary();
  const [mode, setMode] = useState("delete");
  const [target, setTarget] = useState("");
  const ids = new Set([
    category.id,
    ...library.categories
      .filter((c) => c.parentId === category.id)
      .map((c) => c.id),
  ]);
  const count = library.assets.filter((a) => ids.has(a.categoryId)).length;
  const options = library.categories.filter(
    (c) => c.source === "user" && c.parentId && !ids.has(c.id),
  );
  return (
    <Modal title={`删除「${category.name}」`} close={close}>
      <p>该分类包含 {count} 张素材。已放入画布的图层会保留。</p>
      <label>
        素材处理
        <StyledSelect value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="delete">同时删除分类中的素材</option>
          <option value="move" disabled={!options.length}>
            移动素材到其他小分类
          </option>
        </StyledSelect>
      </label>
      {mode === "move" && (
        <label>
          目标小分类
          <StyledSelect
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">选择小分类</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </StyledSelect>
        </label>
      )}
      <div className="dialog-actions">
        <button onClick={close}>取消</button>
        <button
          className="danger"
          disabled={mode === "move" && !target}
          onClick={() => {
            deleteCategory(category.id, mode === "move" ? target : undefined);
            close();
          }}
        >
          删除分类
        </button>
      </div>
    </Modal>
  );
}
