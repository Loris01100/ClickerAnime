import { createSignal } from "solid-js";

const KEY = "clicker-anime:theme";

/** "system" leaves the choice to prefers-color-scheme by stamping no attribute at all. */
export type Theme = "system" | "light" | "dark";

export const THEME_ICON: Record<Theme, string> = { system: "🖥️", light: "☀️", dark: "🌙" };
export const THEME_LABEL: Record<Theme, string> = { system: "Thème système", light: "Thème clair", dark: "Thème sombre" };
export const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function readStored(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // private mode or blocked storage: fall through to the system default
  }
  return "system";
}

function apply(next: Theme) {
  if (next === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", next);
}

const [theme, setThemeSignal] = createSignal<Theme>(readStored());
apply(theme());

export { theme };

export function setTheme(next: Theme) {
  setThemeSignal(next);
  apply(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // nothing to do: the theme still applies for this session
  }
}
