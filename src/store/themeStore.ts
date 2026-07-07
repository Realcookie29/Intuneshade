import { create } from "zustand";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "igm-theme";

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark"; // Mission Control defaults to dark
}

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode(),
  toggle: () =>
    set((s) => {
      const mode = s.mode === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, mode);
      return { mode };
    }),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },
}));
