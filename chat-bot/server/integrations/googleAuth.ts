import { config } from "../config.js";
import { type GmailCredentials, type GoogleSheetsCredentials, getCredentialsData, updateCredentialsData } from "../db/credentials.js";

/**
 * Google OAuth for Google Sheets and Gmail: consent URL, code exchange and access tokens
 * that refresh themselves when expired. Uses Google's REST endpoints (no SDK).
 */

export type GoogleProvider = "google sheets" | "gmail";

export const GOOGLE_SCOPES: Record<GoogleProvider, string[]> = {
  "google sheets": [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
  gmail: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const googleClient = (provider: GoogleProvider) => {
  const client = provider === "gmail" ? config.google.gmail : config.google.sheets;
  if (!client.clientId || !client.clientSecret)
    throw new Error(provider === "gmail" ? "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not configured" : "GOOGLE_SHEETS_CLIENT_ID / GOOGLE_SHEETS_CLIENT_SECRET are not configured");
  return { id: client.clientId, secret: client.clientSecret };
};

export const googleConsentUrl = (provider: GoogleProvider, redirectUri: string, state: string) => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: googleClient(provider).id,
    redirect_uri: redirectUri,
    scope: GOOGLE_SCOPES[provider].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return url.toString();
};

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string; token_type?: string; id_token?: string };

const postToken = async (params: Record<string, string>) => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as TokenResponse & { error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(`Google token error: ${data.error_description ?? data.error ?? response.status}`);
  return data;
};

/** Exchanges the OAuth code; returns tokens (in the format stored for the provider) and the account email. */
export const exchangeGoogleCode = async (provider: GoogleProvider, code: string, redirectUri: string) => {
  const client = googleClient(provider);
  const tokens = await postToken({ grant_type: "authorization_code", code, client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri });
  const grantedScopes = tokens.scope?.split(" ") ?? [];
  if (GOOGLE_SCOPES[provider].some((scope) => !grantedScopes.includes(scope))) throw new Error("Not all required Google permissions were granted");
  const profile = (await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json()) as {
    email?: string;
  };
  const expiry = Date.now() + tokens.expires_in * 1000;
  const data: GoogleSheetsCredentials | GmailCredentials =
    provider === "gmail"
      ? { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiryDate: expiry }
      : { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: expiry, token_type: tokens.token_type, scope: tokens.scope };
  return { data, email: profile.email ?? "Google account" };
};

/** A valid access token for saved credentials, refreshing (and saving) it when expired. */
export const getGoogleAccessToken = async (provider: GoogleProvider, credentialsId: string, workspaceId: string) => {
  if (provider === "gmail") {
    const saved = await getCredentialsData<GmailCredentials>(credentialsId, workspaceId, "gmail");
    if (!saved) throw new Error("Gmail credentials not found");
    if (saved.accessToken && saved.expiryDate && saved.expiryDate > Date.now() + 30_000) return saved.accessToken;
    if (!saved.refreshToken) throw new Error("Gmail credentials have no refresh token; reconnect the account");
    const client = googleClient(provider);
    const tokens = await postToken({ grant_type: "refresh_token", refresh_token: saved.refreshToken, client_id: client.id, client_secret: client.secret });
    await updateCredentialsData(credentialsId, { ...saved, accessToken: tokens.access_token, expiryDate: Date.now() + tokens.expires_in * 1000 });
    return tokens.access_token;
  }
  const saved = await getCredentialsData<GoogleSheetsCredentials>(credentialsId, workspaceId, "google sheets");
  if (!saved) throw new Error("Google Sheets credentials not found");
  if (saved.access_token && saved.expiry_date && saved.expiry_date > Date.now() + 30_000) return saved.access_token;
  if (!saved.refresh_token) throw new Error("Google Sheets credentials have no refresh token; reconnect the account");
  const client = googleClient(provider);
  const tokens = await postToken({ grant_type: "refresh_token", refresh_token: saved.refresh_token, client_id: client.id, client_secret: client.secret });
  await updateCredentialsData(credentialsId, { ...saved, access_token: tokens.access_token, expiry_date: Date.now() + tokens.expires_in * 1000 });
  return tokens.access_token;
};
