import type { ConnectionOptions } from "bullmq";

/**
 * Chat webhook queue contract, shared by the producer (chat API, server/integrations/chatWebhook.ts)
 * and the consumer (worker/chatWebhookWorker.ts). Queue name, job shape and job
 * options are unchanged from the previous system, so queued jobs stay compatible.
 */
export const CHAT_WEBHOOK_QUEUE = "chat-webhook";

/** 5 attempts with exponential backoff from 2 s; keep the last 1000 completed / 5000 failed jobs. */
export const CHAT_WEBHOOK_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export type ChatWebhookJob = {
  ip: string;
  message: string;
  isUser: boolean;
  date: string;
  time: string;
  timestamp: string;
  sessionId?: string;
  /** Live-agent room id (`room:{resultId}_web`). */
  resultId?: string;
  publicId?: string;
  /** True while the bot flow still drives the conversation. */
  isBotActivated?: boolean;
};

/** Parses REDIS_URL into BullMQ connection options (supports user, password, db and rediss:// TLS). */
export const parseRedisUrl = (url: string): ConnectionOptions => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    // Required by BullMQ workers (blocking commands must not be retried by ioredis).
    maxRetriesPerRequest: null,
  };
};
