import { useSyncExternalStore } from "react";

/**
 * App appearance: Light, Dark or System (follows the device setting).
 * The choice is stored in this browser and applied as `data-app-theme` on <html>;
 * the palettes live in theme/app.css. Chat bots keep their own colors (Theme tab).
 */

export type AppTheme = "light" | "dark" | "system";

export const APP_THEMES: { value: AppTheme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "System", icon: "🖵" },
];

export const APP_THEME_STORAGE_KEY = "chat-bot-theme";

const isTheme = (value: unknown): value is AppTheme => value === "light" || value === "dark" || value === "system";

const read = (): AppTheme => {
  try {
    const stored = localStorage.getItem(APP_THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system"; // private mode / storage blocked
  }
};

let current: AppTheme = read();
const listeners = new Set<() => void>();

/** "system" leaves the attribute off, so the CSS media query decides. */
const apply = (theme: AppTheme) => {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-app-theme");
  else root.setAttribute("data-app-theme", theme);
};

export const setAppTheme = (theme: AppTheme) => {
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // not stored: the choice still applies to this page
  }
  for (const listener of listeners) listener();
};

/** Applies the stored choice (the page already did this inline; this keeps them in sync). */
export const initAppTheme = () => apply(current);

export const useAppTheme = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
