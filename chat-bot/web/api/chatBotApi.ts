import { authHeaders, request } from "./http";
import type { ChatBot, ChatBotSummary, ChatBotUpdate, PublishedChatBot } from "./types";

/** Chat Bot management API (/api/v1/chat-bots). */

const BASE = "/api/v1/chat-bots";
const path = (chatBotId: string, suffix = "") => `${BASE}/${encodeURIComponent(chatBotId)}${suffix}`;

export type PublishWarning = { type: string; trademark: string };

export const chatBotApi = {
  async listChatBots(workspaceId: string): Promise<ChatBotSummary[]> {
    return (await request<{ chatBots: ChatBotSummary[] }>(`${BASE}?workspaceId=${encodeURIComponent(workspaceId)}`)).chatBots;
  },

  async getChatBot(chatBotId: string): Promise<ChatBot> {
    return (await request<{ chatBot: ChatBot }>(path(chatBotId))).chatBot;
  },

  async createChatBot(workspaceId: string, chatBot: ChatBotUpdate): Promise<ChatBot> {
    return (await request<{ chatBot: ChatBot }>(BASE, { method: "POST", body: { workspaceId, chatBot } })).chatBot;
  },

  /** `overwrite` skips the backend's conflict check (someone saved a newer version). */
  async updateChatBot(chatBotId: string, update: ChatBotUpdate, { overwrite = false } = {}): Promise<ChatBot> {
    return (
      await request<{ chatBot: ChatBot }>(path(chatBotId), {
        method: "PATCH",
        body: { chatBot: update, ...(overwrite ? { overwrite: true } : {}) },
      })
    ).chatBot;
  },

  async deleteChatBot(chatBotId: string): Promise<void> {
    await request(path(chatBotId), { method: "DELETE" });
  },

  /** Returns null when the chat bot is not published. */
  async getPublishedChatBot(chatBotId: string): Promise<PublishedChatBot | null> {
    return (await request<{ publishedChatBot: PublishedChatBot | null }>(path(chatBotId, "/published"))).publishedChatBot;
  },

  async publishChatBot(chatBotId: string): Promise<PublishWarning[]> {
    const { warnings } = await request<{ warnings?: PublishWarning[] }>(path(chatBotId, "/publish"), { method: "POST" });
    return warnings ?? [];
  },

  async unpublishChatBot(chatBotId: string): Promise<void> {
    await request(path(chatBotId, "/unpublish"), { method: "POST" });
  },

  /** Uploads an image for the chat bot (Web Chat icon, avatars); returns its URL. */
  async uploadImage(chatBotId: string, file: File): Promise<string> {
    const response = await fetch(`${path(chatBotId, "/assets")}?fileName=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", ...authHeaders() },
      body: file,
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!response.ok || !data.url) throw new Error(data.message ?? `Upload failed (${response.status})`);
    return data.url;
  },

  /** Imports an exported chat bot JSON (version 6 format). */
  async importChatBot(workspaceId: string, chatBotJson: unknown): Promise<ChatBot> {
    return (
      await request<{ chatBot: ChatBot }>(`${BASE}/import`, {
        method: "POST",
        body: { workspaceId, chatBot: chatBotJson },
      })
    ).chatBot;
  },
};
