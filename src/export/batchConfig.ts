import type { Asset, Category, EditorDocument } from "../shared/types";
export const batchFormats = [
  "png",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tiff",
  "blp",
  "tga",
] as const;
export type BatchFormat = (typeof batchFormats)[number];
export const formatCapability = (format: BatchFormat) =>
  batchFormats.includes(format) ? "supported" : "unsupported";
export const extension = (format: BatchFormat) =>
  format === "jpeg" ? "jpg" : format === "tiff" ? "tif" : format;
export const replaceableLayers = (document: EditorDocument) =>
  document.layers.filter((layer) => layer.kind !== "base" && !layer.text);
export const textLayers = (document: EditorDocument) =>
  document.layers.filter((layer) => layer.kind !== "base" && layer.text);
export const categoryAssets = (
  assets: Asset[],
  category: Category | undefined,
) =>
  assets.filter(
    (asset) =>
      asset.kind !== "font" &&
      (category?.parentId
        ? asset.categoryId === category.id
        : asset.groupId === category?.id),
  );
export const parseNames = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
export function cleanFilename(name: string) {
  let result =
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || "未命名";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(result))
    result = `_${result}`;
  return result;
}
export function outputNames(names: string[], count: number) {
  const used = new Set<string>();
  return Array.from({ length: count }, (_, index) => {
    const stem = cleanFilename(
      names.length ? names[index] || `${index + 1}` : `${index + 1}`,
    );
    let name = stem,
      suffix = 2;
    while (used.has(name.toLowerCase())) name = `${stem} (${suffix++})`;
    used.add(name.toLowerCase());
    return name;
  });
}
export const cycleAsset = (assets: Asset[], index: number) =>
  assets[index % assets.length];
export function validateBatch(
  document: EditorDocument | undefined,
  layerId: string,
  assets: Asset[],
  count: number,
  format: BatchFormat,
  directory: string,
  replaceText = false,
  textLayerId = "",
) {
  if (!document || document.canvasCreated === false) return "请选择任务";
  if (!replaceableLayers(document).some((layer) => layer.id === layerId))
    return "请选择可替换的图片图层";
  if (!assets.length) return "该分类没有图片素材";
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000)
    return "批量张数必须为 1 至 10000 的整数";
  if (formatCapability(format) === "unsupported") return "不支持该图片格式";
  if (!directory) return "请选择保存地址";
  if (
    replaceText &&
    !textLayers(document).some((layer) => layer.id === textLayerId)
  )
    return "请选择需要替换的文字图层";
  return "";
}
export function replaceBatchLayer(
  document: EditorDocument,
  layerId: string,
  asset: Asset,
): EditorDocument {
  return {
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== layerId) return { ...layer };
      return {
        ...layer,
        imagePath: asset.imagePath,
        assetId: asset.id,
        x: document.width / 2,
        y: document.height / 2,
        width: layer.width,
        height: layer.height,
        rotation: 0,
      };
    }),
  };
}
export function replaceBatchText(
  document: EditorDocument,
  layerId: string,
  content: string,
): EditorDocument {
  return {
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === layerId && layer.text
        ? { ...layer, text: { ...layer.text, content } }
        : { ...layer },
    ),
  };
}
