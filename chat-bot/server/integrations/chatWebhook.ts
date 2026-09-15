import { Queue } from "bullmq";
import { CHAT_WEBHOOK_JOB_OPTIONS, CHAT_WEBHOOK_QUEUE, type ChatWebhookJob, parseRedisUrl } from "../../shared/redis.js";
import type { ChatBubble } from "../../shared/types.js";
import { config } from "../config.js";
import { bubbleToText } from "../engine/bubbles.js";

/**
 * Queues one "chat-webhook" job per chat message; the worker delivers them to
 * CHAT_WEBHOOK_URL. Disabled when CHAT_WEBHOOK_URL is empty. Queueing never blocks
 * or fails the chat: errors are logged.
 */
let queue: Queue<ChatWebhookJob> | undefined;

const getQueue = () =>
  (queue ??= new Queue<ChatWebhookJob>(CHAT_WEBHOOK_QUEUE, {
    connection: parseRedisUrl(config.redisUrl),
    defaultJobOptions: CHAT_WEBHOOK_JOB_OPTIONS,
  }));

export const queueChatWebhook = ({
  ip,
  userMessage,
  botMessages,
  sessionId,
  resultId,
  publicId,
  isBotActivated,
}: {
  ip: string | undefined;
  userMessage: string | undefined;
  botMessages: ChatBubble[];
  sessionId?: string;
  resultId?: string;
  publicId?: string;
  /** True while the flow still expects a reply; false once it ended. */
  isBotActivated: boolean;
}) => {
  if (!config.chatWebhookUrl) return;
  const now = new Date();
  const base = {
    ip: ip ?? "unknown",
    date: now.toISOString().split("T")[0]!,
    time: now.toTimeString().split(" ")[0]!,
    timestamp: now.toISOString(),
    ...(sessionId && { sessionId }),
    ...(resultId && { resultId }),
    ...(publicId && { publicId }),
    isBotActivated,
  };
  const jobs: ChatWebhookJob[] = [
    ...(userMessage !== undefined ? [{ ...base, message: userMessage, isUser: true }] : []),
    ...botMessages.map((bubble) => ({ ...base, message: bubbleToText(bubble), isUser: false })),
  ];
  // Added one by one, in order: the worker delivers strictly in this order.
  (async () => {
    for (const job of jobs) await getQueue().add("send", job);
  })().catch((error) => console.error("[chatWebhook] failed to queue:", error instanceof Error ? error.message : error));
};

export const closeChatWebhookQueue = () => queue?.close();
