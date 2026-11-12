import { expect, it } from "vitest";
import { restoreProject, serializeProject } from "./builtinReferences";
import { projectSchema } from "./schema";
import type { BuiltinLibrary } from "../assets/services/builtin";
import type { ProjectFile } from "../shared/types";

const image = "data:image/png;base64,AAAA";
const thumbnail = "data:image/png;base64,BBBB";
const userImage = "data:image/png;base64,CCCC";
const builtin: BuiltinLibrary = {
  categories: [
    {
      id: "backgrounds",
      name: "底图",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "frames",
      name: "方框",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "rank",
      name: "品阶",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "illustrations",
      name: "插图",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "props",
      name: "道具",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "banners",
      name: "横幅",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "fonts",
      name: "字体",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    },
    {
      id: "rank-test",
      name: "经典",
      parentId: "rank",
      source: "builtin",
      thumbnail,
    },
  ],
  assets: [
    {
      id: "rank-test-image",
      name: "1-UR",
      categoryId: "rank-test",
      groupId: "rank",
      source: "builtin",
      imagePath: image,
      thumbnailPath: thumbnail,
      width: 200,
      height: 200,
    },
  ],
  legacyImages: { "fire-1": "data:image/png;base64,DDDD" },
};
const project: ProjectFile = {
  version: 1,
  document: {
    name: "中文工程",
    width: 768,
    height: 768,
    layers: [
      {
        id: "layer",
        name: "1-UR",
        kind: "asset",
        assetId: "rank-test-image",
        imagePath: image,
        x: 384,
        y: 384,
        width: 200,
        height: 200,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
      },
    ],
  },
  library: {
    categories: [
      ...builtin.categories,
      {
        id: "user",
        name: "我的分类",
        parentId: null,
        source: "user",
        thumbnail: userImage,
      },
    ],
    assets: builtin.assets,
  },
};
it("stores builtin image and category thumbnails as references and preserves user bytes", () => {
  const encoded = serializeProject(project, builtin);
  expect(encoded.document.layers[0].imagePath).toBe(
    "builtin://rank-test-image/image",
  );
  expect(encoded.library.assets[0].thumbnailPath).toBe(
    "builtin://rank-test-image/thumbnail",
  );
  expect(
    encoded.library.categories.find((category) => category.id === "rank-test")
      ?.thumbnail,
  ).toBe("builtin://rank-test-image/thumbnail");
  expect(
    encoded.library.categories.find((category) => category.id === "user")
      ?.thumbnail,
  ).toBe(userImage);
  expect(JSON.stringify(encoded)).not.toContain(image);
  expect(JSON.stringify(encoded)).not.toContain(thumbnail);
  expect(projectSchema.safeParse(encoded).success).toBe(true);
  expect(restoreProject(encoded, builtin)).toEqual(project);
});
it("restores legacy document bytes while replacing outdated builtin categories", () => {
  const old = {
    ...project,
    document: {
      ...project.document,
      layers: [
        { ...project.document.layers[0], imagePath: "/assets/fire-1.png" },
      ],
    },
    library: {
      categories: [{ ...builtin.categories[0], name: "品阶类" }],
      assets: [],
    },
  };
  const encoded = serializeProject(old, builtin);
  expect(encoded.document.layers[0].imagePath).toBe(
    "builtin://legacy-fire-1/image",
  );
  const restored = restoreProject(encoded, builtin);
  expect(restored.document.layers[0].imagePath).toBe(
    builtin.legacyImages!["fire-1"],
  );
  expect(restored.library.categories).toEqual(builtin.categories);
  expect(
    restored.library.categories
      .filter((category) => !category.parentId)
      .map((category) => category.name),
  ).toEqual(["底图", "方框", "品阶", "插图", "道具", "横幅", "字体"]);
});
it("rejects missing builtin references instead of silently dropping project layers", () => {
  const encoded = serializeProject(project, builtin);
  encoded.document.layers[0].imagePath = "builtin://missing/image";
  expect(() => restoreProject(encoded, builtin)).toThrow("内置素材不存在");
});

it("protects font bytes and restores fonts with assets at the group root", () => {
  const font = {
    ...builtin.assets[0],
    id: "font-test",
    groupId: "fonts",
    categoryId: "fonts",
    kind: "font" as const,
    fontData: "data:font/ttf;base64,AAAA",
  };
  const fonts = { ...builtin, assets: [...builtin.assets, font] };
  const current = {
    ...project,
    library: { ...project.library, assets: fonts.assets },
  };
  const encoded = serializeProject(current, fonts);
  expect(encoded.library.assets.at(-1)?.fontData).toBe(
    "builtin://font-test/font",
  );
  expect(JSON.stringify(encoded)).not.toContain(font.fontData);
  expect(projectSchema.safeParse(encoded).success).toBe(true);
  expect(restoreProject(encoded, fonts).library.assets.at(-1)?.fontData).toBe(
    font.fontData,
  );
});
