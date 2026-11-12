import { create } from "zustand";
interface UiState {
  libraryView: "assets" | "templates";
  setLibraryView: (view: "assets" | "templates") => void;
  message: string;
  tone: "error" | "success";
  notify: (message: string, tone?: "error" | "success") => void;
}
let timer: ReturnType<typeof setTimeout>;
export const useUi = create<UiState>((set) => ({
  libraryView: "assets",
  setLibraryView: (libraryView) => set({ libraryView }),
  message: "",
  tone: "success",
  notify: (message, tone = "success") => {
    clearTimeout(timer);
    set({ message, tone });
    timer = setTimeout(() => set({ message: "" }), 5000);
  },
}));
