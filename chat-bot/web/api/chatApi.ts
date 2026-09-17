import { request } from "./http";
import type { ChatMessage, ChatReply, StartChatReply } from "./types";

/**
 * Chat runtime API: startChat / continueChat on this app's server.
 *
 * `mode: "test"` marks conversations from the builder's Test panel: they are not
 * recorded and trigger no webhook (the server only honors it for signed-in users).
 * `embedOrigin` is the website the Web Chat is placed on, checked against the chat
 * bot's allowed origins.
 */

// Bubble text is requested as rich text: structured JSON, rendered without HTML parsing.
const TEXT_FORMAT = "richText";
const CHAT_TIMEOUT_MS = 60_000;

export type ChatContext =
  | { mode: "live" | "test"; embedOrigin?: string }
  /** Builder Test panel: runs the editor's current (unsaved, unpublished) version of the chat bot. */
  | { mode: "preview"; chatBotId: string; getDraft: () => unknown };

const headersFor = (context: ChatContext) => ({
  ...(context.mode === "test" ? { "X-Chat-Bot-Mode": "test" } : {}),
  ...(context.mode !== "preview" && context.embedOrigin ? { "X-Chat-Bot-Embed-Origin": context.embedOrigin } : {}),
});

export const chatApi = {
  async startChat(publicId: string, context: ChatContext, { signal }: { signal?: AbortSignal } = {}): Promise<StartChatReply> {
    const isPreview = context.mode === "preview";
    const url = isPreview
      ? `/api/v1/chat-bots/${encodeURIComponent(context.chatBotId)}/preview/startChat`
      : `/api/v1/chat-bots/${encodeURIComponent(publicId)}/startChat`;
    return request<StartChatReply>(url, {
      method: "POST",
      body: { textBubbleContentFormat: TEXT_FORMAT, ...(isPreview ? { chatBot: context.getDraft() } : {}) },
      headers: headersFor(context),
      signal,
      timeoutMs: CHAT_TIMEOUT_MS,
    });
  },

  /** Relays a visitor message to the live agent (after the flow ended or an agent took over). */
  async sendLiveAgentMessage(sessionId: string, message: string, context: ChatContext): Promise<void> {
    await request(`/api/v1/sessions/${encodeURIComponent(sessionId)}/liveAgentMessage`, { method: "POST", body: { message }, headers: headersFor(context) });
  },

  /** Uploads one file for the current file input; returns its public URL. */
  async uploadFile(sessionId: string, file: File, { signal }: { signal?: AbortSignal } = {}): Promise<string> {
    const response = await fetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/files?fileName=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
      signal,
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!response.ok || !data.url) throw new Error(data.message ?? `Upload failed (${response.status})`);
    return data.url;
  },

  /** `message` is omitted when replying to a client-side action that expects a dedicated reply. */
  continueChat(sessionId: string, message: ChatMessage | undefined, context: ChatContext, { signal }: { signal?: AbortSignal } = {}): Promise<ChatReply> {
    return request<ChatReply>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/continueChat`, {
      method: "POST",
      body: { textBubbleContentFormat: TEXT_FORMAT, ...(message ? { message } : {}) },
      headers: headersFor(context),
      signal,
      timeoutMs: CHAT_TIMEOUT_MS,
    });
  },
};
