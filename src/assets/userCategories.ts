import type { Category } from "../shared/types";

export function isUserGroup(category: Category | undefined) {
  return category?.source === "user" && category.parentId === null;
}

export function isUserAssetCategory(
  category: Category,
  categories: Category[],
) {
  return (
    category.source === "user" &&
    !!category.parentId &&
    isUserGroup(categories.find((parent) => parent.id === category.parentId))
  );
}

export function canImportAssets(
  category: Category | undefined,
  categories: Category[],
) {
  return (
    !!category &&
    (isUserGroup(category) || isUserAssetCategory(category, categories))
  );
}
