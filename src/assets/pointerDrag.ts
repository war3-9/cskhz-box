import { create } from 'zustand';
interface Drag { assetId?: string; x: number; y: number }
export const useAssetDrag = create<Drag>(() => ({ x: 0, y: 0 }));
export function beginAssetDrag(assetId: string, x: number, y: number) { useAssetDrag.setState({ assetId, x, y }); }
export function endAssetDrag() { useAssetDrag.setState({ assetId: undefined }); }
