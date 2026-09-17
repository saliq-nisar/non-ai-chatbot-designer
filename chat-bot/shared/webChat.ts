/**
 * Web Chat appearance and behavior, edited in the builder (Web Chat designer) and saved in
 * the chat bot's settings (`settings.webChat`). The Web Chat script loads it from
 * GET /api/v1/chat-bots/{publicId}/webChat, so changes reach websites without new code.
 * widget/webChat.ts mirrors this shape (it cannot import files).
 */
export type WebChatConfig = {
  position: "right" | "left";
  /** Distance from the page edges, px. */
  offsetX: number;
  offsetY: number;
  button: {
    size: number;
    shape: "circle" | "rounded" | "square";
    backgroundColor: string;
    iconColor: string;
    /** Custom icon image (uploaded or any image URL); empty = default chat icon. */
    iconUrl: string;
    /** Image covers the whole button instead of sitting inside it. */
    isIconFullSize: boolean;
  };
  window: {
    width: number;
    height: number;
    borderRadius: number;
  };
  header: {
    isEnabled: boolean;
    title: string;
    subtitle: string;
    avatarUrl: string;
    backgroundColor: string;
    textColor: string;
  };
  greeting: {
    isEnabled: boolean;
    message: string;
    avatarUrl: string;
    /** Seconds after page load. */
    delaySeconds: number;
  };
  autoOpen: {
    isEnabled: boolean;
    delaySeconds: number;
  };
};

export const DEFAULT_WEB_CHAT_CONFIG: WebChatConfig = {
  position: "right",
  offsetX: 20,
  offsetY: 20,
  button: { size: 56, shape: "circle", backgroundColor: "#2563eb", iconColor: "#ffffff", iconUrl: "", isIconFullSize: false },
  window: { width: 400, height: 640, borderRadius: 16 },
  header: { isEnabled: true, title: "", subtitle: "", avatarUrl: "", backgroundColor: "#2563eb", textColor: "#ffffff" },
  greeting: { isEnabled: false, message: "Hi! 👋 How can we help?", avatarUrl: "", delaySeconds: 3 },
  autoOpen: { isEnabled: false, delaySeconds: 5 },
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Saved (possibly partial or old) settings merged over the defaults, keeping only known fields with the right type. */
export const resolveWebChatConfig = (saved: unknown, fallbackTitle = ""): WebChatConfig => {
  const merge = <T extends Record<string, unknown>>(defaults: T, value: unknown): T => {
    const source = isObject(value) ? value : {};
    return Object.fromEntries(
      Object.entries(defaults).map(([key, defaultValue]) => {
        const candidate = source[key];
        if (isObject(defaultValue)) return [key, merge(defaultValue, candidate)];
        return [key, typeof candidate === typeof defaultValue ? candidate : defaultValue];
      }),
    ) as T;
  };
  const config = merge(DEFAULT_WEB_CHAT_CONFIG, saved);
  if (!config.header.title) config.header.title = fallbackTitle;
  return config;
};
