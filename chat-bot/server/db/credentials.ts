import { config } from "../config.js";
import { HttpError } from "../http.js";
import { query } from "./database.js";

/**
 * Integration credentials ("Credentials" table), encrypted at rest with ENCRYPTION_SECRET.
 * Format (compatible with rows already in the database): AES-GCM, key = the secret's
 * bytes, 12-byte IV stored as hex in "iv", ciphertext stored as base64 in "data".
 *
 * Types: "smtp", "stripe", "google sheets", "gmail".
 */

export type CredentialsType = "smtp" | "stripe" | "google sheets" | "gmail";

export type SmtpCredentials = {
  host?: string;
  port: number;
  username?: string;
  password?: string;
  isTlsEnabled?: boolean;
  from: { email?: string; name?: string };
};
export type StripeCredentials = { live: { secretKey: string; publicKey: string }; test: { secretKey?: string; publicKey?: string } };
/** Google Sheets tokens use Google's field names; Gmail tokens use camelCase (both as stored before). */
export type GoogleSheetsCredentials = { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; token_type?: string; scope?: string };
export type GmailCredentials = { accessToken?: string; refreshToken?: string; expiryDate?: number };

const importKey = async (usage: "encrypt" | "decrypt") => {
  if (!config.encryptionSecret) throw new HttpError(500, "ENCRYPTION_SECRET is not configured");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(config.encryptionSecret), "AES-GCM", false, [usage]);
};

export const encrypt = async (data: object) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey("encrypt"), new TextEncoder().encode(JSON.stringify(data)));
  return { data: Buffer.from(encrypted).toString("base64"), iv: Buffer.from(iv).toString("hex") };
};

export const decrypt = async <T>(data: string, ivHex: string): Promise<T> => {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivHex, "hex") },
    await importKey("decrypt"),
    Buffer.from(data, "base64"),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
};

export const listCredentials = (workspaceId: string, type: CredentialsType) =>
  query<{ id: string; name: string; type: string; createdAt: Date }>(
    `SELECT "id", "name", "type", "createdAt" FROM "Credentials" WHERE "workspaceId" = $1 AND "type" = $2 ORDER BY "createdAt" DESC`,
    [workspaceId, type],
  );

export const createCredentials = async ({ id, workspaceId, type, name, data }: { id: string; workspaceId: string; type: CredentialsType; name: string; data: object }) => {
  const encrypted = await encrypt(data);
  await query(`INSERT INTO "Credentials" ("id", "workspaceId", "type", "name", "data", "iv") VALUES ($1, $2, $3, $4, $5, $6)`, [
    id,
    workspaceId,
    type,
    name,
    encrypted.data,
    encrypted.iv,
  ]);
};

export const updateCredentialsData = async (id: string, data: object) => {
  const encrypted = await encrypt(data);
  await query(`UPDATE "Credentials" SET "data" = $2, "iv" = $3 WHERE "id" = $1`, [id, encrypted.data, encrypted.iv]);
};

export const deleteCredentials = (id: string, workspaceId: string) =>
  query(`DELETE FROM "Credentials" WHERE "id" = $1 AND "workspaceId" = $2`, [id, workspaceId]);

/** Decrypted credentials of a workspace, or undefined when missing. */
export const getCredentialsData = async <T>(id: string, workspaceId: string, type: CredentialsType): Promise<T | undefined> => {
  const [row] = await query<{ data: string; iv: string }>(`SELECT "data", "iv" FROM "Credentials" WHERE "id" = $1 AND "workspaceId" = $2 AND "type" = $3`, [
    id,
    workspaceId,
    type,
  ]);
  return row ? decrypt<T>(row.data, row.iv) : undefined;
};
