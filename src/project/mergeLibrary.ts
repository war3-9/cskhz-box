import { useLibrary } from "../assets/store";
import type { Library } from "../shared/types";

export function mergeProjectLibrary(incoming: Library) {
  const current = useLibrary.getState().library;
  const merge = <T extends { id: string }>(items: T[], extra: T[]) => [
    ...new Map([...items, ...extra].map((item) => [item.id, item])).values(),
  ];
  useLibrary.getState().setLibrary({
    categories: merge(current.categories, incoming.categories),
    assets: merge(current.assets, incoming.assets),
  });
}
