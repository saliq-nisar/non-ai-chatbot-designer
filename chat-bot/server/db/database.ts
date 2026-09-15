import pg from "pg";
import { config } from "../config.js";

/**
 * One connection pool for the whole server. Queries use parameters ($1, $2…) only.
 * Table and column names are the existing database's (e.g. "Typebot" stores chat bots).
 */
// Timestamps are stored as UTC in "timestamp without time zone" columns: read and write them as UTC.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value) => new Date(`${value.replace(" ", "T")}Z`));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, options: "-c TimeZone=UTC" });

pool.on("error", (error) => console.error("[db] idle client error:", error.message));

export const query = async <Row extends object>(text: string, values: unknown[] = []) =>
  (await pool.query<Row>(text, values)).rows;

/** Runs `work` inside a transaction (BEGIN/COMMIT, ROLLBACK on error). */
export const transaction = async <T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/** JSON columns are jsonb: pass values as JSON text. */
export const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));
