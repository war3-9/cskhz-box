import { beforeEach, expect, it } from "vitest";
import { useLibrary } from "./store";
import type { Asset, Category } from "../shared/types";
beforeEach(() =>
  useLibrary.getState().setLibrary({ categories: [], assets: [] }),
);
it("moves assets on category deletion, while removing an entire group and its children", () => {
  const s = useLibrary.getState();
  s.addCategory("大类甲", null, "");
  const g1 = useLibrary.getState().library.categories[0].id;
  s.addCategory("小类甲", g1, "");
  const c1 = useLibrary.getState().activeCategory;
  s.addCategory("大类乙", null, "");
  const g2 = useLibrary.getState().library.categories[2].id;
  s.addCategory("小类乙", g2, "");
  const c2 = useLibrary.getState().activeCategory;
  const asset: Asset = {
    id: "test",
    name: "用户素材",
    categoryId: "",
    groupId: "",
    source: "user",
    imagePath: "/assets/fire-1.png",
    thumbnailPath: "/assets/fire-1.png",
    width: 480,
    height: 480,
  };
  s.addAssets([asset], c1);
  s.deleteCategory(g1, c2);
  expect(useLibrary.getState().library.categories.map((c) => c.name)).toEqual([
    "大类乙",
    "小类乙",
  ]);
  expect(useLibrary.getState().library.assets[0]).toMatchObject({
    categoryId: c2,
    groupId: g2,
  });
  s.deleteCategory(c2);
  expect(useLibrary.getState().library.assets).toHaveLength(0);
});

it("refuses import and custom children in official categories, including malformed parents", () => {
  const official: Category = {
    id: "official",
    name: "道具",
    parentId: null,
    source: "builtin",
    thumbnail: "",
  };
  const categories: Category[] = [
    official,
    { ...official, id: "official-child", parentId: "official" },
    { ...official, id: "legacy-user", parentId: "official", source: "user" },
  ];
  const s = useLibrary.getState();
  s.setLibrary({ categories, assets: [] });
  for (const id of ["official", "official-child", "legacy-user", "missing"]) {
    expect(() => s.addAssets([], id)).toThrow("自定义小分类");
    expect(() => s.addCategory("禁止", id, "")).toThrow("我的素材");
  }
  expect(useLibrary.getState().library.categories).toEqual(categories);
  s.renameCategory("official", "坏名称", "");
  s.deleteCategory("official");
  expect(useLibrary.getState().library.categories).toEqual(categories);
});

it("assigns imported assets user ownership and prevents official ID collisions", () => {
  const s = useLibrary.getState();
  s.addCategory("我的装备", null, "");
  const parentId = useLibrary.getState().activeCategory;
  s.addCategory("武器", parentId, "");
  const categoryId = useLibrary.getState().activeCategory;
  const asset: Asset = {
    id: "a",
    name: "武器",
    source: "builtin",
    groupId: "official",
    categoryId: "official",
    imagePath: "data:image/png;base64,AA==",
    thumbnailPath: "",
    width: 64,
    height: 64,
  };
  s.addAssets([asset], categoryId);
  expect(useLibrary.getState().library.assets[0]).toMatchObject({
    source: "user",
    groupId: parentId,
    categoryId,
  });
  expect(() => s.addAssets([asset], categoryId)).toThrow("标识重复");
  const official = { ...asset, id: "official-image" };
  useLibrary
    .getState()
    .setLibrary({ ...useLibrary.getState().library, assets: [official] });
  expect(() =>
    s.addAssets([{ ...official, source: "user" }], categoryId),
  ).toThrow("标识重复");
  expect(useLibrary.getState().library.assets).toEqual([official]);
});
