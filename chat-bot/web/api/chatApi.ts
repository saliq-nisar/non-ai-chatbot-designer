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

export type ChatContext = { mode: "live" | "test"; embedOrigin?: string };

const headersFor = ({ mode, embedOrigin }: ChatContext) => ({
  ...(mode === "test" ? { "X-Chat-Bot-Mode": "test" } : {}),
  ...(embedOrigin ? { "X-Chat-Bot-Embed-Origin": embedOrigin } : {}),
});

// The API names the bot field "typebot"; the app exposes it as "chatBot".
type StartChatWireReply = Omit<StartChatReply, "chatBot"> & { typebot: StartChatReply["chatBot"] };

export const chatApi = {
  async startChat(publicId: string, context: ChatContext, { signal }: { signal?: AbortSignal } = {}): Promise<StartChatReply> {
    const { typebot, ...reply } = await request<StartChatWireReply>(`/api/v1/typebots/${encodeURIComponent(publicId)}/startChat`, {
      method: "POST",
      body: { textBubbleContentFormat: TEXT_FORMAT },
      headers: headersFor(context),
      signal,
      timeoutMs: CHAT_TIMEOUT_MS,
    });
    return { ...reply, chatBot: typebot };
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
