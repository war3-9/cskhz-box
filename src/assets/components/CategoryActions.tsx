import { folderBinding } from '../folders';
import { FolderCategoryMenu } from './FolderCategoryMenu';
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Category } from "../../shared/types";
import { IconButton } from "../../shared/components/IconButton";
import { CategoryDialog } from "./CategoryDialog";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";

export function CategoryActions({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const binding = folderBinding(category.id);
  const [removing, setRemoving] = useState(false);
  if (category.source !== "user") return null;
  return (
    <>
      <span className="category-actions">
        <IconButton
          label={`编辑${category.name}`}
          disabled={!!binding} onClick={() => setEditing(true)}
        >
          <Pencil size={12} />
        </IconButton>
        <IconButton
          label={`删除${category.name}`}
          disabled={!!binding && !!category.parentId} onClick={event => { if (binding) setMenu({ x: event.clientX, y: event.clientY }); else setRemoving(true); }}
        >
          <Trash2 size={12} />
        </IconButton>
      </span>
      {menu && <FolderCategoryMenu id={category.id} {...menu} close={() => setMenu(undefined)} />}
      {editing && (
        <CategoryDialog edit={category} close={() => setEditing(false)} />
      )}
      {removing && (
        <DeleteCategoryDialog
          category={category}
          close={() => setRemoving(false)}
        />
      )}
    </>
  );
}
