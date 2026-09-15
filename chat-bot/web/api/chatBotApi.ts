import { request } from "./http";
import type { ChatBot, ChatBotSummary, ChatBotUpdate, PublishedChatBot } from "./types";

/**
 * Chat Bot management API — the existing backend endpoints, called as-is.
 * (Paths and body keys contain "typebot": they are fixed backend contracts.)
 * Requests go through this app's server, which adds the API token.
 */

const BASE = "/api/v1/typebots";
const path = (chatBotId: string, suffix = "") => `${BASE}/${encodeURIComponent(chatBotId)}${suffix}`;

export type PublishWarning = { type: string; trademark: string };

export const chatBotApi = {
  async listChatBots(workspaceId: string): Promise<ChatBotSummary[]> {
    const { typebots } = await request<{
      typebots: { id: string; name: string; icon: string | null; publishedTypebotId?: string }[];
    }>(`${BASE}?workspaceId=${encodeURIComponent(workspaceId)}`);
    return typebots.map(({ publishedTypebotId, ...summary }) => ({ ...summary, publishedChatBotId: publishedTypebotId }));
  },

  async getChatBot(chatBotId: string): Promise<ChatBot> {
    return (await request<{ typebot: ChatBot }>(path(chatBotId))).typebot;
  },

  async createChatBot(workspaceId: string, chatBot: ChatBotUpdate): Promise<ChatBot> {
    return (await request<{ typebot: ChatBot }>(BASE, { method: "POST", body: { workspaceId, typebot: chatBot } })).typebot;
  },

  /** `overwrite` skips the backend's conflict check (someone saved a newer version). */
  async updateChatBot(chatBotId: string, update: ChatBotUpdate, { overwrite = false } = {}): Promise<ChatBot> {
    return (
      await request<{ typebot: ChatBot }>(path(chatBotId), {
        method: "PATCH",
        body: { typebot: update, ...(overwrite ? { overwrite: true } : {}) },
      })
    ).typebot;
  },

  async deleteChatBot(chatBotId: string): Promise<void> {
    await request(path(chatBotId), { method: "DELETE" });
  },

  /** Returns null when the chat bot is not published. */
  async getPublishedChatBot(chatBotId: string): Promise<PublishedChatBot | null> {
    const { publishedTypebot } = await request<{
      publishedTypebot: { id: string; typebotId: string; version: string; updatedAt?: string } | null;
    }>(path(chatBotId, "/publishedTypebot"));
    if (!publishedTypebot) return null;
    const { typebotId, ...published } = publishedTypebot;
    return { ...published, chatBotId: typebotId };
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
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!response.ok || !data.url) throw new Error(data.message ?? `Upload failed (${response.status})`);
    return data.url;
  },

  /** Imports an exported chat bot JSON (version 6 format). */
  async importChatBot(workspaceId: string, chatBotJson: unknown): Promise<ChatBot> {
    return (
      await request<{ typebot: ChatBot }>(`${BASE}/import`, {
        method: "POST",
        body: { workspaceId, typebot: chatBotJson },
      })
    ).typebot;
  },
};
