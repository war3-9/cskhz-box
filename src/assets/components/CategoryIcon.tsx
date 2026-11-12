import {
  Folder,
  FolderOpen,
  Gem,
  Image,
  Package,
  PanelTop,
  Square,
  Type,
} from "lucide-react";
export function CategoryIcon({ id, open }: { id: string; open: boolean }) {
  const icons = {
    backgrounds: Image,
    rank: Gem,
    frames: Square,
    illustrations: Image,
    props: Package,
    banners: PanelTop,
    fonts: Type,
  };
  const Icon = icons[id as keyof typeof icons] ?? (open ? FolderOpen : Folder);
  return <Icon size={19} />;
}
