import { z } from "zod";
import { blendModeSchema, layerEffectsSchema } from "../layers/styles/schema";
const id = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(200);
const image = z
  .string()
  .refine(
    (v) =>
      /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(v) ||
      /^\/assets\/[a-z0-9-]+\.png$/.test(v) ||
      /^library-image:\/\/[a-f0-9]{64}$/.test(v) ||
      /^http:\/\/box-image\.localhost\/[a-f0-9]{64}$/.test(v) ||
      /^box-image:\/\/localhost\/[a-f0-9]{64}$/.test(v) ||
      /^blob:https?:\/\/[^\s]+\/[a-f0-9-]{36}$/.test(v) ||
      /^builtin:\/\/[a-z0-9-]+\/(image|thumbnail)$/.test(v),
    "图片引用无效",
  );
const source = z.enum(["builtin", "user"]);
const category = z.object({
  id,
  name,
  parentId: id.nullable(),
  source,
  thumbnail: z.union([image, z.literal("")]),
});
const asset = z.object({
  id,
  name,
  categoryId: id,
  groupId: id,
  source,
  imagePath: image,
  thumbnailPath: image,
  width: z.number().int().positive().max(40000),
  height: z.number().int().positive().max(40000),
  kind: z.enum(["image", "font"]).optional(),
  fontData: z.string().optional(),
  webFontData: z.string().optional(),
});
const layer = z.object({
  id,
  name,
  kind: z.enum(["base", "asset"]),
  assetId: id.optional(),
  imagePath: image,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(40000),
  height: z.number().positive().max(40000),
  rotation: z.number().finite(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  effects: layerEffectsSchema.optional(),
  blendMode: blendModeSchema.optional(),
  text: z
    .object({
      fontId: id,
      content: z.string().min(1).max(1000),
      fontSize: z.number().int().min(8).max(256),
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      stroke: z
        .object({
          enabled: z.boolean(),
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
          width: z.number().finite().min(0).max(32),
        })
        .optional(),
      gradient: z
        .object({
          enabled: z.boolean(),
          startColor: z.string().regex(/^#[0-9a-f]{6}$/i),
          endColor: z.string().regex(/^#[0-9a-f]{6}$/i),
          angle: z.number().finite().min(0).max(360),
        })
        .optional(),
    })
    .optional(),
});
const unique = (values: { id: string }[]) =>
  new Set(values.map((v) => v.id)).size === values.length;
export const projectSchema = z
  .object({
    version: z.literal(1),
    document: z.object({
      name,
      canvasCreated: z.boolean().optional(),
      width: z.number().int().min(64).max(4096),
      height: z.number().int().min(64).max(4096),
      layers: z.array(layer).max(1000),
    }),
    library: z.object({
      categories: z.array(category).max(1000),
      assets: z.array(asset).max(5000),
    }),
  })
  .superRefine((p, ctx) => {
    if (p.document.canvasCreated === false && p.document.layers.length)
      ctx.addIssue({ code: "custom", message: "请先创建画布" });
    if (
      !unique(p.document.layers) ||
      !unique(p.library.categories) ||
      !unique(p.library.assets)
    )
      ctx.addIssue({ code: "custom", message: "存在重复 ID" });
    if (
      p.document.layers.filter((l) => l.kind === "base").length > 1 ||
      p.document.layers.some((l, i) => l.kind === "base" && i !== 0)
    )
      ctx.addIssue({ code: "custom", message: "底图层级无效" });
    for (const c of p.library.categories) {
      if (
        c.parentId &&
        !p.library.categories.some(
          (parent) => parent.id === c.parentId && parent.parentId === null,
        )
      )
        ctx.addIssue({ code: "custom", message: "分类父级无效" });
    }
    for (const a of p.library.assets) {
      if (
        !p.library.categories.some(
          (c) =>
            c.id === a.categoryId &&
            (c.parentId === a.groupId ||
              (c.parentId === null && c.id === a.groupId)),
        )
      )
        ctx.addIssue({ code: "custom", message: "素材分类无效" });
    }
  });
