import { useSyncExternalStore } from "react";

/** Minimal history-based router: the app has four pages, no library needed. */
export type Route =
  | { page: "list" }
  | { page: "builder"; chatBotId: string }
  | { page: "chat"; publicId: string }
  | { page: "login" }
  | { page: "notFound" };

export const routes = {
  list: () => "/",
  builder: (chatBotId: string) => `/chat-bots/${encodeURIComponent(chatBotId)}`,
  chat: (publicId: string) => `/chat/${encodeURIComponent(publicId)}`,
};

const parseRoute = (pathname: string): Route => {
  if (pathname === "/") return { page: "list" };
  if (pathname === "/login") return { page: "login" };
  // "/edit" is accepted too (used by apps that embed the builder).
  const builder = pathname.match(/^\/chat-bots\/([^/]+)(?:\/edit)?$/);
  if (builder) return { page: "builder", chatBotId: decodeURIComponent(builder[1]!) };
  const chat = pathname.match(/^\/chat\/([^/]+)$/);
  if (chat) return { page: "chat", publicId: decodeURIComponent(chat[1]!) };
  return { page: "notFound" };
};

const NAVIGATE_EVENT = "chat-bot:navigate";

export const navigate = (to: string, { replace = false } = {}) => {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
};

export const usePathname = () => useSyncExternalStore(subscribe, () => window.location.pathname);

export const useRoute = () => parseRoute(usePathname());
