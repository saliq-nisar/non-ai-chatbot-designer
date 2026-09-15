import type { CSSProperties } from "react";
import type { ChatBotTheme } from "../api/types";

/**
 * Chat appearance — THE place to customize how a chat looks (viewer, test
 * preview and Web Chat all render through it).
 *
 * 1. `defaultChatAppearance` holds the defaults for every visual token.
 * 2. `resolveChatAppearance` overlays what the user saved in the builder's Theme
 *    tab (the chat bot's `theme`) on top of these defaults.
 * 3. `toCssVariables` turns the result into CSS variables consumed by chat.css.
 */
export type ChatAppearance = {
  colors: {
    background: string;
    text: string;
    hostBubbleBackground: string;
    hostBubbleText: string;
    guestBubbleBackground: string;
    guestBubbleText: string;
    buttonBackground: string;
    buttonText: string;
    inputBackground: string;
    inputText: string;
    inputPlaceholder: string;
    inputBorder: string;
    headerBackground: string;
    headerText: string;
    error: string;
  };
  typography: { fontFamily: string; fontSize: string; lineHeight: string };
  spacing: { containerPadding: string; messageGap: string; bubblePadding: string };
  radius: { bubble: string; button: string; input: string };
  layout: { maxWidth: string; avatarSize: string; buttonsLayout: "wrap" | "vertical" };
  avatar: { isHostEnabled: boolean; hostUrl?: string };
};

export const defaultChatAppearance: ChatAppearance = {
  colors: {
    background: "#ffffff",
    text: "#27272a",
    hostBubbleBackground: "#f4f4f5",
    hostBubbleText: "#18181b",
    guestBubbleBackground: "#2563eb",
    guestBubbleText: "#ffffff",
    buttonBackground: "#2563eb",
    buttonText: "#ffffff",
    inputBackground: "#ffffff",
    inputText: "#18181b",
    inputPlaceholder: "#9095a0",
    inputBorder: "#d4d4d8",
    headerBackground: "#2563eb",
    headerText: "#ffffff",
    error: "#dc2626",
  },
  typography: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: "15px",
    lineHeight: "1.45",
  },
  spacing: { containerPadding: "16px", messageGap: "8px", bubblePadding: "8px 12px" },
  radius: { bubble: "12px", button: "8px", input: "8px" },
  layout: { maxWidth: "720px", avatarSize: "32px", buttonsLayout: "wrap" },
  avatar: { isHostEnabled: false },
};

/** Saved roundness keywords -> CSS radius. */
const ROUNDNESS: Record<string, string> = { none: "0px", medium: "6px", large: "20px" };

const radiusOf = (border: { roundeness?: string; customRoundeness?: number } | undefined, fallback: string) => {
  if (!border?.roundeness) return fallback;
  if (border.roundeness === "custom") return `${border.customRoundeness ?? 0}px`;
  return ROUNDNESS[border.roundeness] ?? fallback;
};

const fontFamilyOf = (font: NonNullable<ChatBotTheme["general"]>["font"], fallback: string) => {
  const family = typeof font === "string" ? font : font?.family;
  return family ? `'${family}', ${fallback}` : fallback;
};

export const resolveChatAppearance = (theme: ChatBotTheme | undefined): ChatAppearance => {
  const d = defaultChatAppearance;
  const chat = theme?.chat;
  const background = theme?.general?.background;
  return {
    colors: {
      ...d.colors,
      background: background?.type === "Color" && background.content ? background.content : d.colors.background,
      text: chat?.container?.color ?? d.colors.text,
      hostBubbleBackground: chat?.hostBubbles?.backgroundColor ?? d.colors.hostBubbleBackground,
      hostBubbleText: chat?.hostBubbles?.color ?? d.colors.hostBubbleText,
      guestBubbleBackground: chat?.guestBubbles?.backgroundColor ?? d.colors.guestBubbleBackground,
      guestBubbleText: chat?.guestBubbles?.color ?? d.colors.guestBubbleText,
      buttonBackground: chat?.buttons?.backgroundColor ?? d.colors.buttonBackground,
      buttonText: chat?.buttons?.color ?? d.colors.buttonText,
      inputBackground: chat?.inputs?.backgroundColor ?? d.colors.inputBackground,
      inputText: chat?.inputs?.color ?? d.colors.inputText,
      inputPlaceholder: chat?.inputs?.placeholderColor ?? d.colors.inputPlaceholder,
      inputBorder: chat?.inputs?.border?.color ?? d.colors.inputBorder,
      headerBackground: chat?.buttons?.backgroundColor ?? d.colors.headerBackground,
      headerText: chat?.buttons?.color ?? d.colors.headerText,
    },
    typography: { ...d.typography, fontFamily: fontFamilyOf(theme?.general?.font, d.typography.fontFamily) },
    spacing: d.spacing,
    radius: {
      bubble: radiusOf(chat?.hostBubbles?.border, d.radius.bubble),
      button: radiusOf(chat?.buttons?.border, d.radius.button),
      input: radiusOf(chat?.inputs?.border, d.radius.input),
    },
    layout: {
      ...d.layout,
      maxWidth: chat?.container?.maxWidth ?? d.layout.maxWidth,
      buttonsLayout: chat?.buttonsInput?.layout ?? d.layout.buttonsLayout,
    },
    avatar: { isHostEnabled: chat?.hostAvatar?.isEnabled ?? d.avatar.isHostEnabled, hostUrl: chat?.hostAvatar?.url },
  };
};

export const toCssVariables = (appearance: ChatAppearance): CSSProperties => {
  const { colors, typography, spacing, radius, layout } = appearance;
  return {
    "--chat-bg": colors.background,
    "--chat-text": colors.text,
    "--chat-host-bubble-bg": colors.hostBubbleBackground,
    "--chat-host-bubble-text": colors.hostBubbleText,
    "--chat-guest-bubble-bg": colors.guestBubbleBackground,
    "--chat-guest-bubble-text": colors.guestBubbleText,
    "--chat-button-bg": colors.buttonBackground,
    "--chat-button-text": colors.buttonText,
    "--chat-input-bg": colors.inputBackground,
    "--chat-input-text": colors.inputText,
    "--chat-input-placeholder": colors.inputPlaceholder,
    "--chat-input-border": colors.inputBorder,
    "--chat-header-bg": colors.headerBackground,
    "--chat-header-text": colors.headerText,
    "--chat-error": colors.error,
    "--chat-font-family": typography.fontFamily,
    "--chat-font-size": typography.fontSize,
    "--chat-line-height": typography.lineHeight,
    "--chat-container-padding": spacing.containerPadding,
    "--chat-message-gap": spacing.messageGap,
    "--chat-bubble-padding": spacing.bubblePadding,
    "--chat-bubble-radius": radius.bubble,
    "--chat-button-radius": radius.button,
    "--chat-input-radius": radius.input,
    "--chat-max-width": layout.maxWidth,
    "--chat-avatar-size": layout.avatarSize,
    "--chat-buttons-direction": layout.buttonsLayout === "vertical" ? "column" : "row",
  } as CSSProperties;
};
