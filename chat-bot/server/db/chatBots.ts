import type { ChatBot, ChatBotEvent, ChatBotSettings, ChatBotTheme, Edge, Group, Variable } from "../../shared/types.js";
import { json, query, transaction } from "./database.js";

/** Chat bot rows: "Typebot" (editable chat bot) and "PublicTypebot" (its published version). */

type ChatBotRow = {
  id: string;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
  icon: string | null;
  name: string;
  folderId: string | null;
  groups: Group[];
  events: ChatBotEvent[] | null;
  variables: Variable[];
  edges: Edge[];
  theme: ChatBotTheme;
  selectedThemeTemplateId: string | null;
  settings: ChatBotSettings;
  publicId: string | null;
  customDomain: string | null;
  workspaceId: string;
  resultsTablePreferences: unknown;
  isArchived: boolean;
  isClosed: boolean;
  whatsAppCredentialsId: string | null;
  riskLevel: number | null;
};

export type PublishedRow = {
  id: string;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
  typebotId: string;
  groups: Group[];
  events: ChatBotEvent[] | null;
  variables: Variable[];
  edges: Edge[];
  theme: ChatBotTheme;
  settings: ChatBotSettings;
};

const toChatBot = (row: ChatBotRow): ChatBot => ({
  ...row,
  version: row.version ?? "3",
  events: row.events ?? [],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const listChatBots = (workspaceId: string) =>
  query<{ id: string; name: string; icon: string | null; publishedTypebotId: string | null }>(
    `SELECT t."id", t."name", t."icon", p."id" AS "publishedTypebotId"
     FROM "Typebot" t LEFT JOIN "PublicTypebot" p ON p."typebotId" = t."id"
     WHERE t."workspaceId" = $1 AND t."isArchived" = false
     ORDER BY t."createdAt" DESC`,
    [workspaceId],
  );

export const findChatBot = async (chatBotId: string) => {
  const [row] = await query<ChatBotRow>(`SELECT * FROM "Typebot" WHERE "id" = $1 AND "isArchived" = false`, [chatBotId]);
  return row ? toChatBot(row) : undefined;
};

export const workspaceExists = async (workspaceId: string) =>
  (await query(`SELECT 1 FROM "Workspace" WHERE "id" = $1`, [workspaceId])).length > 0;

export const isPublicIdTaken = async (publicId: string, exceptChatBotId?: string) =>
  (await query(`SELECT 1 FROM "Typebot" WHERE "publicId" = $1 AND "id" <> $2`, [publicId, exceptChatBotId ?? ""])).length > 0;

export type NewChatBot = Pick<ChatBot, "id" | "version" | "name" | "icon" | "groups" | "events" | "variables" | "edges" | "theme" | "settings" | "publicId" | "workspaceId">;

export const insertChatBot = async (bot: NewChatBot) => {
  const [row] = await query<ChatBotRow>(
    `INSERT INTO "Typebot" ("id", "version", "name", "icon", "groups", "events", "variables", "edges", "theme", "settings", "publicId", "workspaceId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [bot.id, bot.version, bot.name, bot.icon, json(bot.groups), json(bot.events), json(bot.variables), json(bot.edges), json(bot.theme), json(bot.settings), bot.publicId, bot.workspaceId],
  );
  return toChatBot(row!);
};

/** Columns the update endpoint may change. JSON columns are marked so values get serialized. */
const UPDATABLE_COLUMNS = {
  name: false,
  icon: false,
  version: false,
  publicId: false,
  isClosed: false,
  groups: true,
  events: true,
  variables: true,
  edges: true,
  theme: true,
  settings: true,
} as const;

export type ChatBotChanges = Partial<Pick<ChatBot, keyof typeof UPDATABLE_COLUMNS> & { isClosed: boolean }>;

/** Updates the chat bot and, when it is published, its published version too (same transaction). */
export const updateChatBot = (chatBotId: string, changes: ChatBotChanges) =>
  transaction(async (db) => {
    const sets: string[] = [`"updatedAt" = now()`];
    const values: unknown[] = [];
    for (const [column, isJson] of Object.entries(UPDATABLE_COLUMNS)) {
      const value = changes[column as keyof ChatBotChanges];
      if (value === undefined) continue;
      values.push(isJson ? json(value) : value);
      sets.push(`"${column}" = $${values.length}`);
    }
    values.push(chatBotId);
    const { rows } = await db.query<ChatBotRow>(`UPDATE "Typebot" SET ${sets.join(", ")} WHERE "id" = $${values.length} RETURNING *`, values);
    const bot = toChatBot(rows[0]!);
    await db.query(
      `UPDATE "PublicTypebot" SET "version" = $2, "groups" = $3, "events" = $4, "variables" = $5, "edges" = $6, "theme" = $7, "settings" = $8, "updatedAt" = now()
       WHERE "typebotId" = $1`,
      [bot.id, bot.version, json(bot.groups), json(bot.events), json(bot.variables), json(bot.edges), json(bot.theme), json(bot.settings)],
    );
    return bot;
  });

/** Soft delete like before: archived, unpublished, public ID released, results archived. */
export const archiveChatBot = (chatBotId: string) =>
  transaction(async (db) => {
    await db.query(`DELETE FROM "PublicTypebot" WHERE "typebotId" = $1`, [chatBotId]);
    await db.query(`UPDATE "Result" SET "isArchived" = true WHERE "typebotId" = $1`, [chatBotId]);
    await db.query(`UPDATE "Typebot" SET "isArchived" = true, "publicId" = NULL, "customDomain" = NULL WHERE "id" = $1`, [chatBotId]);
  });

export const findPublishedChatBot = async (chatBotId: string) =>
  (await query<PublishedRow>(`SELECT * FROM "PublicTypebot" WHERE "typebotId" = $1`, [chatBotId]))[0];

/** Copies the current chat bot into its published version (creates it on first publish). */
export const publishChatBot = async (bot: ChatBot, newPublishedId: string) => {
  await query(
    `INSERT INTO "PublicTypebot" ("id", "typebotId", "version", "groups", "events", "variables", "edges", "theme", "settings")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT ("typebotId") DO UPDATE SET "version" = EXCLUDED."version", "groups" = EXCLUDED."groups", "events" = EXCLUDED."events",
       "variables" = EXCLUDED."variables", "edges" = EXCLUDED."edges", "theme" = EXCLUDED."theme", "settings" = EXCLUDED."settings", "updatedAt" = now()`,
    [newPublishedId, bot.id, bot.version, json(bot.groups), json(bot.events), json(bot.variables), json(bot.edges), json(bot.theme), json(bot.settings)],
  );
};

export const unpublishChatBot = (chatBotId: string) => query(`DELETE FROM "PublicTypebot" WHERE "typebotId" = $1`, [chatBotId]);

/** What the chat runtime needs to start a conversation from a public ID. */
export const findRunnableChatBot = async (publicId: string) =>
  (
    await query<PublishedRow & { name: string; publicId: string; workspaceId: string; isArchived: boolean; isClosed: boolean; isSuspended: boolean; isQuarantined: boolean }>(
      `SELECT p.*, t."name", t."publicId", t."workspaceId", t."isArchived", t."isClosed", w."isSuspended", w."isQuarantined"
       FROM "PublicTypebot" p
       JOIN "Typebot" t ON t."id" = p."typebotId"
       JOIN "Workspace" w ON w."id" = t."workspaceId"
       WHERE t."publicId" = $1`,
      [publicId],
    )
  )[0];

/** Published versions of the given chat bots in one workspace (for "Chat bot link" blocks). */
export const findPublishedChatBots = (chatBotIds: string[], workspaceId: string) =>
  chatBotIds.length === 0
    ? Promise.resolve([] as PublishedRow[])
    : query<PublishedRow>(
        `SELECT p.* FROM "PublicTypebot" p JOIN "Typebot" t ON t."id" = p."typebotId"
         WHERE p."typebotId" = ANY($1) AND t."workspaceId" = $2 AND t."isArchived" = false`,
        [chatBotIds, workspaceId],
      );
