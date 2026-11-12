import { create } from "zustand";
import type { Asset, Category, Library } from "../shared/types";
import { isUserAssetCategory, isUserGroup } from "./userCategories";

interface LibraryState {
  library: Library;
  activeCategory: string;
  search: string;
  setLibrary: (library: Library) => void;
  select: (id: string) => void;
  setSearch: (search: string) => void;
  addCategory: (
    name: string,
    parentId: string | null,
    thumbnail: string,
  ) => void;
  renameCategory: (id: string, name: string, thumbnail: string) => void;
  addAssets: (assets: Asset[], categoryId: string) => void;
  deleteCategory: (id: string, moveTo?: string) => void;
  renameAsset: (id: string, name: string) => void;
  removeAsset: (id: string) => void;
}
export const useLibrary = create<LibraryState>((set, get) => ({
  library: { categories: [], assets: [] },
  activeCategory: "",
  search: "",
  setLibrary: (library) =>
    set({
      library,
      activeCategory: library.categories.find((c) => !c.parentId)?.id ?? "",
    }),
  select: (activeCategory) => set({ activeCategory, search: "" }),
  setSearch: (search) => set({ search }),
  addCategory: (name, parentId, thumbnail) => {
    if (
      parentId &&
      !isUserGroup(get().library.categories.find((c) => c.id === parentId))
    )
      throw new Error("小分类只能添加到我的素材大分类中。");
    const category: Category = {
      id: crypto.randomUUID(),
      name: name.trim(),
      parentId,
      source: "user",
      thumbnail,
    };
    set((s) => ({
      library: {
        ...s.library,
        categories: [...s.library.categories, category],
      },
      activeCategory: category.id,
    }));
  },
  renameCategory: (id, name, thumbnail) =>
    set((s) => ({
      library: {
        ...s.library,
        categories: s.library.categories.map((c) =>
          c.id === id && c.source === "user"
            ? { ...c, name: name.trim(), thumbnail }
            : c,
        ),
      },
    })),
  addAssets: (assets, categoryId) => {
    if (get().library.assets.length + assets.length > 5000)
      throw new Error('素材库最多支持 5000 张素材，请先减少素材或拆分导入。');
    const category = get().library.categories.find(
      (c) =>
        c.id === categoryId && isUserAssetCategory(c, get().library.categories),
    );
    if (!category) throw new Error("请选择一个自定义小分类。");
    const ids = new Set(get().library.assets.map((asset) => asset.id));
    for (const asset of assets) {
      if (ids.has(asset.id)) throw new Error("素材标识重复，请重新导入图片。");
      ids.add(asset.id);
    }
    set((s) => ({
      library: {
        ...s.library,
        assets: [
          ...s.library.assets,
          ...assets.map((a) => ({
            ...a,
            source: "user" as const,
            categoryId,
            groupId: category.parentId!,
          })),
        ],
      },
    }));
  },
  deleteCategory: (id, moveTo) => {
    const s = get();
    const category = s.library.categories.find((c) => c.id === id);
    if (!category || category.source !== "user") return;
    const ids = new Set([
      id,
      ...s.library.categories.filter((c) => c.parentId === id).map((c) => c.id),
    ]);
    const target = s.library.categories.find(
      (c) =>
        c.id === moveTo &&
        isUserAssetCategory(c, s.library.categories) &&
        !ids.has(c.id),
    );
    if (moveTo && !target) throw new Error("请选择有效的目标小分类。");
    const assets = s.library.assets.flatMap((a) =>
      !ids.has(a.categoryId)
        ? [a]
        : target
          ? [{ ...a, categoryId: target.id, groupId: target.parentId! }]
          : [],
    );
    const categories = s.library.categories.filter((c) => !ids.has(c.id));
    set({
      library: { categories, assets },
      activeCategory: ids.has(s.activeCategory)
        ? (categories.find((c) => c.parentId)?.id ?? "")
        : s.activeCategory,
    });
  },
  renameAsset: (id, name) =>
    set((s) => ({
      library: {
        ...s.library,
        assets: s.library.assets.map((a) =>
          a.id === id && a.source === "user" ? { ...a, name } : a,
        ),
      },
    })),
  removeAsset: (id) =>
    set((s) => ({
      library: {
        ...s.library,
        assets: s.library.assets.filter(
          (a) => a.id !== id || a.source === "builtin",
        ),
      },
    })),
}));
