import { Folder } from "lucide-react";
import { useLibrary } from "../store";
import type { Category } from "../../shared/types";
import { CategoryActions } from "./CategoryActions";
import { useEditor } from "../../layers/store";
import { requireCanvas } from "../../canvas/requireCanvas";

export function SubcategoryGrid({ categories }: { categories: Category[] }) {
  const { library, select, search } = useLibrary();
  const visible = categories.filter((category) =>
    category.name.includes(search),
  );
  return (
    <div className="subcategory-grid">
      {visible.map((category) => {
        const assets = library.assets.filter(
          (asset) => asset.categoryId === category.id,
        );
        const thumbnail = category.thumbnail || assets[0]?.thumbnailPath;
        const isColor = assets[0]?.id.startsWith("background-color-");
        return (
          <article key={category.id} className="subcategory-card">
            <button
              className="subcategory-select"
              aria-label={`${category.name} ${assets.length}`}
              onClick={() => {
                select(category.id);
                if (isColor && requireCanvas())
                  useEditor.getState().setBase(assets[0]);
              }}
            >
              {thumbnail ? (
                <img src={thumbnail} alt="" />
              ) : (
                <Folder size={26} />
              )}
              <span>{category.name}</span>
              <small>{assets.length}</small>
            </button>
            <CategoryActions category={category} />
          </article>
        );
      })}
      {!visible.length && <div className="empty-panel">暂无分类</div>}
    </div>
  );
}
