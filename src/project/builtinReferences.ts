import type { ProjectFile } from "../shared/types";
import { restoredImageUrl } from '../assets/imageRepository';
import {
  getBuiltinLibrary,
  type BuiltinLibrary,
} from "../assets/services/builtin";

function imageReferences(builtin: BuiltinLibrary) {
  const encode = new Map<string, string>();
  const decode = new Map<string, string>();
  const add = (image: string, reference: string) => {
    encode.set(image, reference);
    decode.set(reference, image);
  };
  for (const asset of builtin.assets) {
    add(asset.imagePath, `builtin://${asset.id}/image`);
    add(asset.thumbnailPath, `builtin://${asset.id}/thumbnail`);
    if (asset.fontData) add(asset.fontData, `builtin://${asset.id}/font`);
    if (asset.webFontData)
      add(asset.webFontData, `builtin://${asset.id}/webfont`);
  }
  for (const [id, image] of Object.entries(builtin.legacyImages ?? {})) {
    const reference = `builtin://legacy-${id}/image`;
    add(image, reference);
    encode.set(`/assets/${id}.png`, reference);
  }
  return { encode, decode };
}

export function serializeProject(
  project: ProjectFile,
  builtin = getBuiltinLibrary(),
): ProjectFile {
  const { encode } = imageReferences(builtin);
  const reference = (image: string) => encode.get(image) ?? image;
  return {
    ...project,
    document: {
      ...project.document,
      layers: project.document.layers.map((layer) => ({
        ...layer,
        imagePath: reference(layer.imagePath),
      })),
    },
    library: {
      categories: project.library.categories.map((category) => ({
        ...category,
        thumbnail: reference(category.thumbnail),
      })),
      assets: project.library.assets.map((asset) => ({
        ...asset,
        imagePath: reference(asset.imagePath),
        thumbnailPath: reference(asset.thumbnailPath),
        ...(asset.fontData ? { fontData: reference(asset.fontData) } : {}),
        ...(asset.webFontData
          ? { webFontData: reference(asset.webFontData) }
          : {}),
      })),
    },
  };
}

export function restoreProject(
  project: ProjectFile,
  builtin = getBuiltinLibrary(),
  onMissing?: (reference: string) => void,
): ProjectFile {
  const { encode, decode } = imageReferences(builtin);
  const resolve = (image: string) => {
    const reference = encode.get(image) ?? image;
    if (!reference.startsWith("builtin://")) {
      try { return restoredImageUrl(image); }
      catch (error) { if (!onMissing) throw error; onMissing(image); return image; }
    }
    const bytes = decode.get(reference);
    if (!bytes) {
      if (onMissing) { onMissing(reference); return reference; }
      throw new Error(`工程引用的内置素材不存在：${reference}`);
    }
    return bytes;
  };
  return {
    ...project,
    document: {
      ...project.document,
      layers: project.document.layers.map((layer) => ({
        ...layer,
        imagePath: resolve(layer.imagePath),
      })),
    },
    library: {
      categories: [
        ...builtin.categories,
        ...project.library.categories
          .filter((category) => category.source === "user")
          .map((category) => ({
            ...category,
            thumbnail: resolve(category.thumbnail),
          })),
      ],
      assets: [
        ...builtin.assets,
        ...project.library.assets
          .filter((asset) => asset.source === "user")
          .map((asset) => ({
            ...asset,
            imagePath: resolve(asset.imagePath),
            thumbnailPath: resolve(asset.thumbnailPath),
          })),
      ],
    },
  };
}
