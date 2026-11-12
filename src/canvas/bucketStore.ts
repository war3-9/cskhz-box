import { create } from "zustand";

interface BucketState {
  active: boolean;
  color: string;
  recent: string[];
  toggle: () => void;
  setColor: (color: string) => void;
  clear: () => void;
}
export const useBucket = create<BucketState>((set) => ({
  active: false,
  color: "#ffffff",
  recent: ["#ffffff", "#000000", "#2563eb", "#ef4444"],
  toggle: () => set((state) => ({ active: !state.active })),
  setColor: (color) =>
    set((state) => ({
      active: true,
      color,
      recent: [color, ...state.recent.filter((item) => item !== color)].slice(
        0,
        8,
      ),
    })),
  clear: () => set({ active: false }),
}));
