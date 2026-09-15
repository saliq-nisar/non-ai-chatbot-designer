import { createId } from "../../shared/createId.js";
import { config } from "../config.js";
import { workspaceExists } from "../db/chatBots.js";
import * as credentials from "../db/credentials.js";
import { badRequest, isObject, notFound, publicOrigin, readJsonObject, type Route, sendJson } from "../http.js";
import { exchangeGoogleCode, type GoogleProvider, getGoogleAccessToken, googleConsentUrl } from "../integrations/googleAuth.js";
import { listSheets } from "../integrations/googleSheets.js";
import { signJwt, verifyJwt } from "../jwt.js";

/**
 * Integration accounts of a workspace (signed-in users / API token only):
 *   SMTP and Stripe keys are entered in the builder; Google Sheets and Gmail connect with OAuth.
 * Secrets are encrypted in the database and never returned.
 */

const TYPES = new Set<credentials.CredentialsType>(["smtp", "stripe", "google sheets", "gmail"]);
const OAUTH_PROVIDERS: Record<string, GoogleProvider> = { "google-sheets": "google sheets", gmail: "gmail" };
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const assertWorkspace = async (workspaceId: unknown) => {
  if (typeof workspaceId !== "string" || !(await workspaceExists(workspaceId))) throw notFound("Workspace not found");
  return workspaceId;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

const readSecretData = (type: credentials.CredentialsType, data: unknown): object => {
  if (!isObject(data)) throw badRequest("`data` must be an object");
  if (type === "smtp") {
    const from = isObject(data.from) ? data.from : {};
    const port = Number(data.port);
    if (!text(data.host) || !Number.isInteger(port) || !text(from.email)) throw badRequest("SMTP needs host, port and a from email");
    return { host: text(data.host), port, username: text(data.username), password: text(data.password), isTlsEnabled: data.isTlsEnabled === true, from: { email: text(from.email), name: text(from.name) } };
  }
  if (type === "stripe") {
    const live = isObject(data.live) ? data.live : {};
    const test = isObject(data.test) ? data.test : {};
    if (!text(live.secretKey) || !text(live.publicKey)) throw badRequest("Stripe needs the live secret and publishable keys");
    return { live: { secretKey: text(live.secretKey), publicKey: text(live.publicKey) }, test: { secretKey: text(test.secretKey), publicKey: text(test.publicKey) } };
  }
  throw badRequest(`"${type}" accounts are connected with Google sign-in`);
};

const oauthRedirectUri = (req: Parameters<typeof publicOrigin>[0]) => `${publicOrigin(req)}/api/v1/credentials/oauth/callback`;

/** Only same-app paths are accepted as the page to come back to. */
const safeReturnPath = (value: unknown) => (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/");

export const credentialsRoutes: Route[] = [
  {
    method: "GET",
    pattern: /^\/api\/v1\/credentials$/,
    handler: async ({ res, url }) => {
      const workspaceId = await assertWorkspace(url.searchParams.get("workspaceId"));
      const type = url.searchParams.get("type") as credentials.CredentialsType;
      if (!TYPES.has(type)) throw badRequest("Unknown credentials type");
      sendJson(res, 200, { credentials: await credentials.listCredentials(workspaceId, type) });
    },
  },

  {
    method: "POST",
    pattern: /^\/api\/v1\/credentials$/,
    handler: async ({ req, res }) => {
      const body = await readJsonObject(req);
      const workspaceId = await assertWorkspace(body.workspaceId);
      const type = body.type as credentials.CredentialsType;
      if (!TYPES.has(type)) throw badRequest("Unknown credentials type");
      const name = text(body.name);
      if (!name) throw badRequest("`name` is required");
      const id = createId();
      await credentials.createCredentials({ id, workspaceId, type, name, data: readSecretData(type, body.data) });
      sendJson(res, 200, { credentials: { id, name, type } });
    },
  },

  {
    method: "DELETE",
    pattern: /^\/api\/v1\/credentials\/([\w-]+)$/,
    handler: async ({ res, url, params }) => {
      const workspaceId = await assertWorkspace(url.searchParams.get("workspaceId"));
      await credentials.deleteCredentials(params[0]!, workspaceId);
      sendJson(res, 200, { message: "success" });
    },
  },

  /** Starts Google sign-in (browser navigation). */
  {
    method: "GET",
    pattern: /^\/api\/v1\/credentials\/oauth\/(google-sheets|gmail)\/authorize$/,
    handler: async ({ req, res, url, params }) => {
      const workspaceId = await assertWorkspace(url.searchParams.get("workspaceId"));
      const provider = OAUTH_PROVIDERS[params[0]!]!;
      const state = signJwt({ workspaceId, provider, returnTo: safeReturnPath(url.searchParams.get("returnTo")) }, config.sessionSecret, OAUTH_STATE_TTL_SECONDS);
      res.writeHead(302, { Location: googleConsentUrl(provider, oauthRedirectUri(req), state) });
      res.end();
    },
  },

  /** Google redirects here; the account is saved and the builder page reopens. */
  {
    method: "GET",
    pattern: /^\/api\/v1\/credentials\/oauth\/callback$/,
    handler: async ({ req, res, url }) => {
      const claims = verifyJwt(url.searchParams.get("state") ?? "", config.sessionSecret) as { workspaceId?: string; provider?: GoogleProvider; returnTo?: string } | undefined;
      if (!claims?.workspaceId || !claims.provider) throw badRequest("Sign-in expired, please try again");
      const returnTo = new URL(safeReturnPath(claims.returnTo), publicOrigin(req));
      const code = url.searchParams.get("code");
      if (!code) {
        returnTo.searchParams.set("credentialsError", url.searchParams.get("error") ?? "Google sign-in was cancelled");
      } else {
        try {
          const { data, email } = await exchangeGoogleCode(claims.provider, code, oauthRedirectUri(req));
          const id = createId();
          await credentials.createCredentials({ id, workspaceId: claims.workspaceId, type: claims.provider, name: email, data });
          returnTo.searchParams.set("credentialsId", id);
        } catch (error) {
          returnTo.searchParams.set("credentialsError", error instanceof Error ? error.message : "Google sign-in failed");
        }
      }
      res.writeHead(302, { Location: returnTo.pathname + returnTo.search });
      res.end();
    },
  },

  /** Sheets and column names of a spreadsheet, for the Google Sheets block editor. */
  {
    method: "GET",
    pattern: /^\/api\/v1\/credentials\/([\w-]+)\/google-sheets\/([\w-]+)\/sheets$/,
    handler: async ({ res, url, params }) => {
      const workspaceId = await assertWorkspace(url.searchParams.get("workspaceId"));
      try {
        const accessToken = await getGoogleAccessToken("google sheets", params[0]!, workspaceId);
        sendJson(res, 200, { sheets: await listSheets(accessToken, params[1]!) });
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : "Could not read the spreadsheet");
      }
    },
  },
];
