import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "bullmq";
import { CHAT_WEBHOOK_QUEUE, type ChatWebhookJob, parseRedisUrl } from "../shared/redis.js";

/**
 * Chat webhook worker.
 *
 * The chat API enqueues one job per chat message (user or bot) on the
 * "chat-webhook" Redis queue during startChat / continueChat. This worker POSTs
 * each job's payload to CHAT_WEBHOOK_URL. A non-2xx response throws, so BullMQ
 * retries it (5 attempts, exponential backoff — see shared/redis.ts).
 */

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL?.trim();
if (!WEBHOOK_URL) {
  console.error("[chatWebhookWorker] CHAT_WEBHOOK_URL is not set — exiting");
  process.exit(1);
}
const REDIS_URL = process.env.REDIS_URL?.trim() || "redis://localhost:6379";
const REQUEST_TIMEOUT_MS = 30_000;

const worker = new Worker<ChatWebhookJob>(
  CHAT_WEBHOOK_QUEUE,
  async (job) => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job.data),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)");
      throw new Error(`Webhook responded ${response.status}: ${body.slice(0, 500)}`);
    }
  },
  {
    connection: parseRedisUrl(REDIS_URL),
    // Strict FIFO delivery: one job at a time, in enqueue order, so the webhook
    // receives messages in the order they were sent. Trade-off: a job that keeps
    // failing blocks the jobs behind it until its retries are exhausted.
    // Run only ONE instance of this worker to keep that ordering.
    concurrency: 1,
  },
);

worker.on("ready", () => console.log(`[chatWebhookWorker] connected to Redis, consuming "${CHAT_WEBHOOK_QUEUE}" (concurrency=1)`));
worker.on("completed", (job) => console.log(`[chatWebhookWorker] job ${job.id} sent`));
worker.on("failed", (job, error) =>
  console.error(`[chatWebhookWorker] job ${job?.id} failed (attempt ${job?.attemptsMade ?? "?"}):`, error.message),
);
worker.on("error", (error) => console.error("[chatWebhookWorker] error:", error.message));

const shutdown = async () => {
  console.log("[chatWebhookWorker] shutting down — waiting for the current job");
  await worker.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
