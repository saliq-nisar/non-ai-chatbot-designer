import { pool } from "./database.js";

/**
 * Creates the tables the Chat Bot system uses when they don't exist yet
 * (fresh database). Existing databases are left untouched: every statement is
 * IF NOT EXISTS, so running it on each start is safe.
 *
 * Tables: "ChatBot" = chat bots · "PublishedChatBot" = their published versions ·
 *   "Result" / "AnswerV2" = conversations and answers · "ChatSession" = live chat state.
 */
const SCHEMA_SQL = `
DO $$ BEGIN
  CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER', 'GUEST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PRO', 'LIFETIME', 'OFFERED', 'CUSTOM', 'UNLIMITED', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT,
  "email" TEXT UNIQUE,
  "emailVerified" TIMESTAMP(3),
  "onboardingCategories" JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "plan" "Plan" NOT NULL DEFAULT 'FREE',
  "additionalChatsIndex" INTEGER NOT NULL DEFAULT 0,
  "additionalStorageIndex" INTEGER NOT NULL DEFAULT 0,
  "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
  "isSuspended" BOOLEAN NOT NULL DEFAULT false,
  "isPastDue" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "MemberInWorkspace" (
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "role" "WorkspaceRole" NOT NULL,
  UNIQUE ("userId", "workspaceId")
);

CREATE TABLE IF NOT EXISTS "ChatBot" (
  "id" TEXT PRIMARY KEY,
  "version" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "icon" TEXT,
  "name" TEXT NOT NULL,
  "folderId" TEXT,
  "groups" JSONB NOT NULL,
  "events" JSONB,
  "variables" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "theme" JSONB NOT NULL,
  "selectedThemeTemplateId" TEXT,
  "settings" JSONB NOT NULL,
  "publicId" TEXT UNIQUE,
  "customDomain" TEXT UNIQUE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "resultsTablePreferences" JSONB,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "whatsAppCredentialsId" TEXT,
  "riskLevel" INTEGER
);
CREATE INDEX IF NOT EXISTS "ChatBot_workspaceId_idx" ON "ChatBot"("workspaceId");

CREATE TABLE IF NOT EXISTS "PublishedChatBot" (
  "id" TEXT PRIMARY KEY,
  "version" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "chatBotId" TEXT NOT NULL UNIQUE REFERENCES "ChatBot"("id") ON DELETE CASCADE,
  "groups" JSONB NOT NULL,
  "events" JSONB,
  "variables" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "theme" JSONB NOT NULL,
  "settings" JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS "Result" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "chatBotId" TEXT NOT NULL REFERENCES "ChatBot"("id") ON DELETE CASCADE,
  "variables" JSONB NOT NULL,
  "isCompleted" BOOLEAN NOT NULL,
  "hasStarted" BOOLEAN,
  "isArchived" BOOLEAN DEFAULT false,
  "lastChatSessionId" TEXT
);

CREATE TABLE IF NOT EXISTS "AnswerV2" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "attachedFileUrls" JSONB,
  "resultId" TEXT NOT NULL REFERENCES "Result"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Credentials" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "data" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "iv" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" JSONB NOT NULL,
  "isReplying" BOOLEAN
);
`;

export const ensureSchema = async () => {
  await pool.query(SCHEMA_SQL);
};
