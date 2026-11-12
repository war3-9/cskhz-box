import type { EditorDocument } from "../shared/types";
const HISTORY_LIMIT = 80;
export const appendSnapshot = (
  past: EditorDocument[],
  document: EditorDocument,
) => [...past, document].slice(-HISTORY_LIMIT);
