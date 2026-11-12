import { create } from "zustand";
export const useBatchState = create<{ busy: boolean }>(() => ({ busy: false }));
