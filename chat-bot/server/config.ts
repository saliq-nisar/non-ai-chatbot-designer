import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Values already present in the environment win over the .env file.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const read = (name: string) => process.env[name]?.trim() || undefined;

const required = (name: string, fallbackName?: string) => {
  const value = read(name) ?? (fallbackName ? read(fallbackName) : undefined);
  if (!value) {
    const names = fallbackName ? `${name} (or ${fallbackName})` : name;
    throw new Error(`Missing required environment variable ${names}. See .env.example.`);
  }
  return value;
};

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "");

// Signed-token mode for the embedded builder (disabled, see server/embed.ts):
// const embedTokenSecret = read("EMBED_TOKEN_SECRET");
// if (embedTokenSecret && embedTokenSecret.length < 32) throw new Error("EMBED_TOKEN_SECRET must be at least 32 characters.");

const sessionSecret = required("NEXTAUTH_SECRET");
if (sessionSecret.length < 32) throw new Error("NEXTAUTH_SECRET must be at least 32 characters.");

/** All server configuration, read once at startup. See .env.example for descriptions. */
export const config = {
  port: Number(read("PORT") ?? 3002),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  /** Token accepted as `Authorization: Bearer <API_TOKEN>` on the management API. */
  apiToken: required("API_TOKEN"),
  /** Owner of the seeded workspace (first entry when comma-separated). */
  adminEmail: required("ADMIN_EMAIL").split(",")[0]!.trim().toLowerCase(),
  login: {
    username: required("LOGIN_USERNAME", "ADMIN_EMAIL").split(",")[0]!.trim(),
    password: required("LOGIN_PASSWORD", "ADMIN_PASSWORD"),
  },
  sessionSecret,
  publicUrl: read("CHAT_BOT_PUBLIC_URL") ? withoutTrailingSlash(read("CHAT_BOT_PUBLIC_URL")!) : undefined,
  pinnedWorkspaceId: read("CHAT_BOT_WORKSPACE_ID"),
  redisUrl: read("REDIS_URL") ?? "redis://localhost:6379",
  /** When empty, chat messages are not queued for the webhook worker. */
  chatWebhookUrl: read("CHAT_WEBHOOK_URL"),
  saveWebChatContactUrl: read("SAVE_WEBCHAT_CONTACT_URL"),
  liveAgent: {
    jwtSecret: read("WIDGET_JWT_SECRET"),
    jwtExpiresIn: read("WIDGET_JWT_EXPIRES_IN") ?? "24h",
    socketHost: read("NEXT_PUBLIC_LIVE_AGENT_SOCKET_HOST"),
  },
  /** Builder embedded in another app, allowed for these parent sites (see server/embed.ts). */
  embed: {
    // tokenSecret: read("EMBED_TOKEN_SECRET"), // signed-token mode (disabled)
    allowedOrigins: (read("EMBED_ALLOWED_ORIGINS") ?? "").split(",").map((origin) => withoutTrailingSlash(origin.trim())).filter(Boolean),
  },
  publicIpLookupUrl: read("PUBLIC_IP_LOOKUP_URL") ?? "https://api.ipify.org?format=json",
  /** 32 characters. Encrypts saved integration credentials (SMTP, Stripe, Google). */
  encryptionSecret: read("ENCRYPTION_SECRET"),
  /** Default SMTP account for Email blocks ("Default" credentials). */
  smtp: {
    host: read("SMTP_HOST"),
    port: Number(read("SMTP_PORT") ?? 25),
    username: read("SMTP_USERNAME"),
    password: read("SMTP_PASSWORD"),
    secure: read("SMTP_SECURE") === "true",
    ignoreTls: read("SMTP_IGNORE_TLS") === "true",
    isAuthDisabled: read("SMTP_AUTH_DISABLED") === "true",
    /** "Name <email@example.com>" */
    from: read("NEXT_PUBLIC_SMTP_FROM"),
  },
  google: {
    sheets: { clientId: read("GOOGLE_SHEETS_CLIENT_ID"), clientSecret: read("GOOGLE_SHEETS_CLIENT_SECRET") },
    gmail: { clientId: read("GMAIL_CLIENT_ID"), clientSecret: read("GMAIL_CLIENT_SECRET") },
  },
  uploads: {
    /** Where uploaded files are stored. */
    directory: read("UPLOADS_DIR") ?? "uploads",
    /** Maximum size of one uploaded file, in MB. */
    maxSizeMb: Number(read("NEXT_PUBLIC_BOT_FILE_UPLOAD_MAX_SIZE") ?? 10),
  },
} as const;
