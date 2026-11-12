import { z } from 'zod';
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const camera = z.object({ yaw: z.number().finite(), pitch: z.number().min(-1.5).max(1.5), distance: z.number().min(1).max(25), panX: z.number().finite(), panY: z.number().finite() });
const savedViewerSchema = z.object({
  exportDirectory: z.string().max(32768).optional(),
  captureDirectory: z.string().max(32768).optional(),
  captureFrame: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(.2).max(1), height: z.number().min(.2).max(1) }).refine(frame => frame.x + frame.width <= 1.000001 && frame.y + frame.height <= 1.000001).optional(),
  exportNames: z.record(z.string(), z.string().max(120).regex(/^[^<>:"/\\|?*\x00-\x1f]+\.(mdx|mdl)$/i).refine(value => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value))).optional(),
  settings: z.object({ hideModelTextures: z.boolean().optional(), ground: z.string().max(300).optional(), team: color, background: color, speed: z.number().min(.1).max(3), loop: z.boolean(), spacing: z.number().min(50).max(2000), pageSize: z.union([z.literal(24), z.literal(50), z.literal(100)]), action: z.string().max(100), sideWidth: z.number().min(240).max(500), rows: z.number().int().min(1).max(20), height: z.number().min(-2000).max(2000), cardSize: z.enum(['small', 'medium', 'large']).optional() }).optional(),
  favorites: z.array(z.string()).max(100000).optional(), categories: z.record(z.string(), z.string()).optional(), categoryNames: z.array(z.string().max(100)).max(200).optional(),
  recent: z.array(z.string()).max(12).optional(), sessionPaths: z.array(z.string()).max(50).optional(), sourceRoles: z.record(z.string(), z.enum(['primary', 'supplement', 'game'])).optional(), activeSource: z.string().optional(),
  selected: z.array(z.string()).max(100000).optional(), current: z.object({ sourceId: z.string(), path: z.string() }).optional(),
  query: z.string().optional(), directory: z.string().optional(), page: z.number().int().nonnegative().optional(), sort: z.enum(['group', 'name', 'name-desc', 'size', 'size-desc', 'type', 'type-desc']).optional(), mode: z.enum(['grid', 'list', 'exhibit']).optional(), kind: z.enum(['model', 'texture', 'terrain']).optional(), category: z.string().optional(), camera: camera.optional(), sequence: z.number().int().nonnegative().optional(), frame: z.number().nonnegative().optional(), scroll: z.number().nonnegative().optional(), sideScroll: z.number().nonnegative().optional(),
});
export function validateSavedViewer(value: unknown) { const result = savedViewerSchema.safeParse(value); return result.success ? result.data : {}; }
