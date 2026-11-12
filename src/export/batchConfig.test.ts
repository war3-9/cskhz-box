import { expect, it } from "vitest";
import { emptyDocument } from "../layers/store";
import type { Asset, ImageLayer } from "../shared/types";
import {
  categoryAssets,
  cleanFilename,
  cycleAsset,
  formatCapability,
  outputNames,
  parseNames,
  replaceBatchLayer,
  replaceBatchText,
  replaceableLayers,
  validateBatch,
} from "./batchConfig";
const asset: Asset = {
  id: "a",
  name: "道具",
  groupId: "props",
  categoryId: "child",
  source: "user",
  imagePath: "data:image/png;base64,BBBB",
  thumbnailPath: "",
  width: 64,
  height: 64,
};
const layer: ImageLayer = {
  id: "target",
  name: "目标",
  kind: "asset",
  imagePath: "data:image/png;base64,AAAA",
  x: 30,
  y: 20,
  width: 40,
  height: 50,
  rotation: 15,
  opacity: 0.5,
  visible: true,
  locked: false,
};
const document = {
  ...emptyDocument(),
  canvasCreated: true,
  layers: [
    { ...layer, kind: "base" as const, id: "base" },
    layer,
    {
      ...layer,
      id: "text",
      text: { content: "字", fontId: "f", fontSize: 20, color: "#fff" },
    },
  ],
};
it("filters base and text, selects categories and cycles materials", () => {
  expect(replaceableLayers(document).map((item) => item.id)).toEqual([
    "target",
  ]);
  expect(
    categoryAssets([asset, { ...asset, kind: "font" }], {
      id: "props",
      name: "道具",
      parentId: null,
      source: "builtin",
      thumbnail: "",
    }),
  ).toEqual([asset]);
  expect(cycleAsset([asset, { ...asset, id: "b" }], 3).id).toBe("b");
});
it("parses UTF-8 BOM, blanks and produces safe unique Windows names", () => {
  expect(parseNames("\uFEFF 金鳞扇\r\n\n 雷鸣塔 \n")).toEqual([
    "金鳞扇",
    "雷鸣塔",
  ]);
  expect(
    outputNames(["A", "a", "A (2)", "../CON", "NUL.txt"], 6),
  ).toEqual(["A", "a (2)", "A (2) (2)", ".._CON", "_NUL.txt", "6"]);
  expect(outputNames([], 3)).toEqual(["1", "2", "3"]);
  expect(cleanFilename('a:b*?"<>|/\\')).not.toMatch(/[<>:"/\\|?*]/);
});
it("validates target, count, directory and accepts BLP/TGA", () => {
  expect(validateBatch(document, "target", [asset], 1, "png", "dir")).toBe("");
  for (const count of [0, -1, 1.5, Infinity, 10001])
    expect(
      validateBatch(document, "target", [asset], count, "png", "dir"),
    ).toContain("整数");
  expect(validateBatch(document, "base", [asset], 1, "png", "dir")).toContain(
    "图片图层",
  );
  expect(validateBatch(document, "target", [], 1, "png", "dir")).toContain(
    "素材",
  );
  expect(validateBatch(document, "target", [asset], 1, "blp", "dir")).toBe("");
  expect(formatCapability("blp")).toBe("supported");
  expect(validateBatch(document, "target", [asset], 1, "tga", "dir")).toBe("");
});
it("replaces image source in an independent copy while preserving the layer name", () => {
  const snapshot = JSON.stringify(document);
  const result = replaceBatchLayer(document, "target", asset);
  expect(JSON.stringify(document)).toBe(snapshot);
  expect(result.layers[1]).toEqual({
    ...layer,
    imagePath: asset.imagePath,
    assetId: asset.id,
    x: document.width / 2,
    y: document.height / 2,
    rotation: 0,
  });
  expect(result.layers[0]).toEqual(document.layers[0]);
});
it("replaces the selected text content independently while retaining its style", () => {
  const input = {
    ...document,
    layers: document.layers.map((item) =>
      item.id === "text"
        ? { ...item, text: { ...item.text!, content: "旧字", fontSize: 22 } }
        : item,
    ),
  };
  const result = replaceBatchText(input, "text", "新名字");
  expect(result.layers[2].text).toMatchObject({
    content: "新名字",
    fontSize: 22,
  });
  expect(input.layers[2].text?.content).toBe("旧字");
  expect(
    validateBatch(
      document,
      "target",
      [asset],
      1,
      "png",
      "dir",
      true,
      "missing",
    ),
  ).toContain("文字图层");
});
