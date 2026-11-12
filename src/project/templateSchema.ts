import { z } from "zod";
import { projectSchema } from "./schema";

export const templateSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  updatedAt: z.number().finite(),
  preview: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/),
  project: projectSchema,
});
