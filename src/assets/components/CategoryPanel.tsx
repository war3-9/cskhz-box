import { isTauri } from '@tauri-apps/api/core';
import { initializeFolderLibrary, folderBinding, folderError } from '../folders';
import { FolderCategoryDialog } from './FolderCategoryDialog';
import { FolderCategoryMenu } from './FolderCategoryMenu';
import { useEffect, useState } from "react";
import { FileStack, FolderPlus } from "lucide-react";
import { useLibrary } from "../store";
import { CategoryDialog } from "./CategoryDialog";
import { CategoryIcon } from "./CategoryIcon";
import { CategoryActions } from "./CategoryActions";
import { useUi } from "../../app/uiStore";

export function CategoryPanel() {
  const { library, activeCategory, select } = useLibrary();
  const [create, setCreate] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  useEffect(() => { void initializeFolderLibrary().catch(folderError); }, []);
  const { libraryView, setLibraryView } = useUi();
  const selected = library.categories.find(
    (category) => category.id === activeCategory,
  );
  const activeGroup = selected?.parentId ?? selected?.id;
  return (
    <aside className="category-panel" aria-label="素材导航">
      <nav className="category-scroll">
        <div className="category-shortcuts">
          <div className="section-label">工作区</div>
          <button
            className={`group-toggle template-nav ${libraryView === "templates" ? "active" : ""}`}
            aria-current={libraryView === "templates" ? "page" : undefined}
            onClick={() => setLibraryView("templates")}
          >
            <FileStack size={17} />
            <span>模板</span>
          </button>
        </div>
        {(["builtin", "user"] as const).map((source) => (
          <div key={source}>
            <div className="section-label">
              {source === "builtin" ? "内置素材" : "我的素材"}
            </div>
            {library.categories
              .filter((group) => !group.parentId && group.source === source)
              .map((group) => (
                <div
                  key={group.id}
                  onContextMenu={e => { if (folderBinding(group.id)) { e.preventDefault(); setMenu({ id: group.id, x: e.clientX, y: e.clientY }); } }}
                  className={`group-row ${libraryView === "assets" && activeGroup === group.id ? "active" : ""}`}
                >
                  <button
                    className="group-toggle"
                    aria-current={
                      libraryView === "assets" && activeGroup === group.id
                        ? "page"
                        : undefined
                    }
                    onClick={() => {
                      setLibraryView("assets");
                      select(group.id);
                    }}
                  >
                    <CategoryIcon id={group.id} open={false} />
                    <span>{group.name}</span>
                  </button>
                  <CategoryActions category={group} />
                </div>
              ))}
          </div>
        ))}
      </nav>
      <div className="category-footer">
        {libraryView === "assets" && (
          <button
            className="secondary full-width"
            onClick={() => setCreate(true)}
          >
            <FolderPlus size={16} />
            新建分类
          </button>
        )}
        <span>{libraryView === "templates" ? "模板库" : "本地素材库"}</span>
      </div>
      {create && (isTauri() ? <FolderCategoryDialog close={() => setCreate(false)} /> : <CategoryDialog close={() => setCreate(false)} />)}
      {menu && <FolderCategoryMenu {...menu} close={() => setMenu(undefined)} />}
    </aside>
  );
}
