import type pg from "pg";
import type { Variable } from "../../shared/types.js";
import type { SessionState } from "../engine/types.js";
import { json, query } from "./database.js";

/** Chat sessions ("ChatSession"), results ("Result") and answers ("AnswerV2"). */

export const insertSession = (db: pg.PoolClient, id: string, state: SessionState) =>
  db.query(`INSERT INTO "ChatSession" ("id", "state") VALUES ($1, $2)`, [id, json(state)]);

/** `version` is the row's "updatedAt" as the database's own text, used for compare-and-set. */
export const findSession = async (id: string) =>
  (await query<{ state: SessionState | { engine?: string }; version: string }>(`SELECT "state", "updatedAt"::text AS "version" FROM "ChatSession" WHERE "id" = $1`, [id]))[0];

/**
 * Saves the new state only if nobody else saved the session since it was loaded
 * (compare-and-set on "updatedAt"). Returns false when another request won.
 * Finished recorded conversations delete their session instead.
 */
export const saveSession = async (db: pg.PoolClient, id: string, loadedVersion: string, state: SessionState | undefined) => {
  const result = state
    ? await db.query(`UPDATE "ChatSession" SET "state" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "updatedAt"::text = $2`, [id, loadedVersion, json(state)])
    : await db.query(`DELETE FROM "ChatSession" WHERE "id" = $1 AND "updatedAt"::text = $2`, [id, loadedVersion]);
  return (result.rowCount ?? 0) > 0;
};

/** Saves the conversation result: variables with a value (session-only ones excluded), progress flags. */
export const upsertResult = (
  db: pg.PoolClient,
  { resultId, chatBotId, variables, isCompleted, hasStarted, sessionId }: { resultId: string; chatBotId: string; variables: Variable[]; isCompleted: boolean; hasStarted: boolean; sessionId: string },
) => {
  const saved = variables
    .filter((variable) => !variable.isSessionVariable && variable.value !== null && variable.value !== undefined)
    .map(({ id, name, value }) => ({ id, name, value }));
  return db.query(
    `INSERT INTO "Result" ("id", "typebotId", "variables", "isCompleted", "hasStarted", "lastChatSessionId")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("id") DO UPDATE SET "variables" = EXCLUDED."variables", "hasStarted" = EXCLUDED."hasStarted",
       "isCompleted" = "Result"."isCompleted" OR EXCLUDED."isCompleted", "lastChatSessionId" = EXCLUDED."lastChatSessionId"`,
    [resultId, chatBotId, json(saved), isCompleted, hasStarted, sessionId],
  );
};

export const insertAnswers = async (db: pg.PoolClient, resultId: string, answers: { blockId: string; content: string }[]) => {
  for (const answer of answers)
    await db.query(`INSERT INTO "AnswerV2" ("blockId", "content", "resultId") VALUES ($1, $2, $3)`, [answer.blockId, answer.content, resultId]);
};

/**
 * The conversation behind a session ID, even after the session row was removed at the
 * end of the flow (the result keeps the last session ID). Used by live-agent messages.
 */
export const findResultBySessionId = async (sessionId: string) =>
  (
    await query<{ id: string; publicId: string | null }>(
      `SELECT r."id", t."publicId" FROM "Result" r JOIN "Typebot" t ON t."id" = r."typebotId" WHERE r."lastChatSessionId" = $1 LIMIT 1`,
      [sessionId],
    )
  )[0];
