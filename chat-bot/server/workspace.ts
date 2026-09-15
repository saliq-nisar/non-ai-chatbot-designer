import { createId } from "../shared/createId.js";
import { config } from "./config.js";
import { transaction } from "./db/database.js";

/**
 * Workspace initialization — runs once at startup, idempotent and safe to run
 * from several instances at the same time.
 *
 *   1. Take a Postgres advisory lock (other starting instances wait here).
 *   2. Find the admin user (ADMIN_EMAIL); create it if missing.
 *   3. CHAT_BOT_WORKSPACE_ID set?  -> it must exist, use it.
 *      Otherwise use the admin's oldest workspace; create "My workspace" if it has none.
 *   4. Commit (releases the lock). The ID lives in the database, so every restart
 *      resolves to the same workspace.
 */
const SEED_LOCK_KEY = 815_204_731; // arbitrary constant shared by all instances
const DEFAULT_WORKSPACE_NAME = "My workspace";

export const initializeWorkspace = () =>
  transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock($1)", [SEED_LOCK_KEY]);

    let userId = (await db.query<{ id: string }>(`SELECT "id" FROM "User" WHERE lower("email") = $1 LIMIT 1`, [config.adminEmail])).rows[0]?.id;
    if (!userId) {
      userId = createId();
      await db.query(
        `INSERT INTO "User" ("id", "email", "name", "emailVerified", "onboardingCategories") VALUES ($1, $2, $3, now(), '[]')`,
        [userId, config.adminEmail, config.adminEmail.split("@")[0]],
      );
      console.log(`[workspace] created admin user ${config.adminEmail}`);
    }

    if (config.pinnedWorkspaceId) {
      const pinned = (await db.query<{ id: string; name: string }>(`SELECT "id", "name" FROM "Workspace" WHERE "id" = $1`, [config.pinnedWorkspaceId])).rows[0];
      if (!pinned) throw new Error(`CHAT_BOT_WORKSPACE_ID=${config.pinnedWorkspaceId} does not exist in the database.`);
      await db.query(
        `INSERT INTO "MemberInWorkspace" ("userId", "workspaceId", "role") VALUES ($1, $2, 'ADMIN') ON CONFLICT ("userId", "workspaceId") DO NOTHING`,
        [userId, pinned.id],
      );
      console.log(`[workspace] using pinned workspace "${pinned.name}" (${pinned.id})`);
      return pinned.id;
    }

    const existing = (
      await db.query<{ id: string; name: string }>(
        `SELECT w."id", w."name" FROM "Workspace" w
         JOIN "MemberInWorkspace" m ON m."workspaceId" = w."id"
         WHERE m."userId" = $1 ORDER BY w."createdAt" ASC LIMIT 1`,
        [userId],
      )
    ).rows[0];
    if (existing) {
      console.log(`[workspace] using "${existing.name}" (${existing.id})`);
      return existing.id;
    }

    const workspaceId = createId();
    await db.query(`INSERT INTO "Workspace" ("id", "name") VALUES ($1, $2)`, [workspaceId, DEFAULT_WORKSPACE_NAME]);
    await db.query(`INSERT INTO "MemberInWorkspace" ("userId", "workspaceId", "role") VALUES ($1, $2, 'ADMIN')`, [userId, workspaceId]);
    console.log(`[workspace] created "${DEFAULT_WORKSPACE_NAME}" (${workspaceId})`);
    return workspaceId;
  });
