import { create } from 'zustand';

// Invalid input is transient UI state, not part of the saved document/history.
export const useArrayNameEdit = create<{ valid: boolean; setValid: (valid: boolean) => void }>(set => ({
  valid: true, setValid: valid => set({ valid }),
}));
