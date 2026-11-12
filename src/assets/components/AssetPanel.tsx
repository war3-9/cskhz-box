import { useState as useFolderState } from 'react';
import { folderBinding, useFolderLibrary, refreshFolder, uploadFolderImages, folderError } from '../folders';
import { FolderCategoryDialog } from './FolderCategoryDialog';
import { CategoryDialog } from './CategoryDialog';
import { useRef, useState } from "react";
import {
  ArrowLeft,
  FolderPlus,
  Images,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { useLibrary } from "../store";
import { IconButton } from "../../shared/components/IconButton";
import { ImportAssetsDialog } from "./ImportAssetsDialog";
import { RenameAssetDialog } from "./RenameAssetDialog";
import type { Asset } from "../../shared/types";
import { AssetGrid } from './AssetGrid';
import { SubcategoryGrid } from "./SubcategoryGrid";
import { CategoryActions } from "./CategoryActions";
import { TemplatePanel } from "../../project/components/TemplatePanel";
import { useUi } from "../../app/uiStore";
import { canImportAssets } from "../userCategories";
import { StyledSelect } from '../../shared/components/StyledSelect';
import { sortAssets, type AssetSort } from '../sortAssets';
export { ASSET_MIME } from "./AssetPreview";
export function AssetPanel() {
  const { library, activeCategory, select, search, setSearch } =
    useLibrary();
  const [importing, setImporting] = useState(false);
  const [creatingChild, setCreatingChild] = useFolderState(false);
  const folderState = useFolderLibrary();
  const binding = folderBinding(activeCategory);
  const importHere = () => { if (binding) void uploadFolderImages(activeCategory).catch(folderError); else setImporting(true); };
  const [edit, setEdit] = useState<Asset>();
  const [sort, setSort] = useState<AssetSort>('natural');
  const scroll = useRef<HTMLDivElement>(null);
  const libraryView = useUi((state) => state.libraryView);
  const category = library.categories.find((c) => c.id === activeCategory);
  const importAllowed = canImportAssets(category, library.categories);
  if (libraryView === "templates") return <TemplatePanel />;
  const children = library.categories.filter(
    (c) => c.parentId === activeCategory,
  );
  const assets = library.assets.filter(
    (a) =>
      a.categoryId === activeCategory &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const isBackground =
    category?.id === "backgrounds" || category?.parentId === "backgrounds";
  const directGroup = new Set(["backgrounds", "props", "banners", "fonts"]);
  const browsingCategories =
    (children.length > 0 || !!binding && !category?.parentId) && !directGroup.has(category?.id ?? "");
  const displayedAssets = sortAssets((
    directGroup.has(category?.id ?? "")
      ? library.assets.filter((asset) => asset.groupId === category?.id)
      : assets
  ).filter((asset) => asset.name.toLowerCase().includes(search.toLowerCase())), sort);
  return (
    <aside className="asset-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {category?.parentId && (
              <IconButton
                label="返回小分类"
                onClick={() => select(category.parentId!)}
              >
                <ArrowLeft size={16} />
              </IconButton>
            )}
            <Images size={19} />
            {browsingCategories ? "小分类" : "详细素材"}
          </h2>
          <span className="panel-subtitle">
            {category?.name ?? "未选择分类"}{" "}
            <span>
              · {browsingCategories ? children.length : displayedAssets.length}
            </span>
          </span>
        </div>
        <div className="asset-heading-actions">
        {category?.parentId && <CategoryActions category={category} />}
        {category?.source === 'user' && !category.parentId && <button type="button" className="text-button asset-heading-button" onClick={() => setCreatingChild(true)}><FolderPlus size={14} />新建小分类</button>}
        {binding && <button type="button" className="text-button asset-heading-button" disabled={folderState.busy} onClick={() => void refreshFolder(binding.id)}><RefreshCw size={14} />刷新</button>}
        {importAllowed && (!binding || !!category?.parentId) && (
          <IconButton label="导入素材" onClick={importHere}>
            <Upload size={17} />
          </IconButton>
        )}
        </div>
      </div>
      {binding && folderState.errors[binding.id] && <p role="status" className="error-text">{folderState.errors[binding.id]}</p>}
      <div className="asset-toolbar">
        <div className="asset-search">
          <Search size={15} />
          <input
            aria-label="搜索素材"
            placeholder="搜索素材"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <StyledSelect aria-label="素材显示顺序" className="asset-sort-select" value={sort} onChange={event => setSort(event.target.value as AssetSort)}>
          <option value="natural">名称顺序</option>
          <option value="descending">名称倒序</option>
          <option value="imported">导入顺序</option>
          <option value="reverse-imported">原始倒序</option>
        </StyledSelect>
      </div>
      <div className="asset-scroll" ref={scroll}>
        {browsingCategories && <SubcategoryGrid categories={children} />}
        {(!browsingCategories || displayedAssets.length > 0) && (
          <>
            <AssetGrid key={`${activeCategory}/${search}`} assets={displayedAssets} scroll={scroll} isBackground={isBackground} edit={setEdit} />
            {!displayedAssets.length && (
              <div className="empty-panel">
                <Images size={28} />
                <span>暂无素材</span>
                {importAllowed && (!binding || !!category?.parentId) && (
                  <button
                    className="text-button"
                    onClick={importHere}
                  >
                    导入素材
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {importAllowed && (!binding || !!category?.parentId) && (
        <div className="asset-footer">
          <button
            className="secondary full-width"
            onClick={importHere}
          >
            <Upload size={15} />
            导入素材
          </button>
        </div>
      )}
      {importing && importAllowed && (
        <ImportAssetsDialog close={() => setImporting(false)} />
      )}
      {creatingChild && category && (binding ? <FolderCategoryDialog parentId={category.id} close={() => setCreatingChild(false)} /> : <CategoryDialog parentId={category.id} close={() => setCreatingChild(false)} />)}
      {edit && (
        <RenameAssetDialog asset={edit} close={() => setEdit(undefined)} />
      )}
    </aside>
  );
}
