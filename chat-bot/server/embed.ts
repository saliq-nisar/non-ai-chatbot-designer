import type { IncomingMessage } from "node:http";
import { config } from "./config.js";
import { signJwt, verifyJwt } from "./jwt.js";

/**
 * Embedded builder: another app shows /chat-bots/:id/edit?embed=true in an iframe, without sign-in.
 *
 * Allowed when the iframe's parent page is one of EMBED_ALLOWED_ORIGINS (the browser's
 * `Referer` header of the iframe request). Embedding is disabled while the list is empty.
 * Browsers can't fake the Referer, but scripts can: anyone who knows a chat bot's id and an
 * allowed origin can open that chat bot's builder. Use the signed-token mode (commented out
 * below) when that is not acceptable.
 *
 * The page then gets an internal key, signed by this server and valid for its one chat bot,
 * which the builder sends with its API calls (`X-Chat-Bot-Embed-Token`); third-party iframes
 * get no cookies, so the sign-in cookie can't be used.
 */

export const EMBED_TOKEN_HEADER = "x-chat-bot-embed-token";

const EMBED_KEY_PURPOSE = "embed";
const EMBED_KEY_LIFETIME_SECONDS = 8 * 60 * 60;

/** Internal key for one embedded page (signed with this server's own secret). */
const createEmbedKey = (chatBotId: string) => signJwt({ chatBotId, purpose: EMBED_KEY_PURPOSE }, config.sessionSecret, EMBED_KEY_LIFETIME_SECONDS);

/** Returns the chat bot id the key was issued for, when valid and not expired. */
export const verifyEmbedToken = (token: string | null | undefined) => {
  if (!token) return undefined;
  const claims = verifyJwt(token, config.sessionSecret);
  return claims?.purpose === EMBED_KEY_PURPOSE && typeof claims.chatBotId === "string" && claims.chatBotId ? claims.chatBotId : undefined;
};

// ---- Signed-token mode (disabled) ----------------------------------------------------------
// The parent app's backend signed { chatBotId, exp } with EMBED_TOKEN_SECRET and added
// &token=… to the iframe URL. To use it again: restore `tokenSecret` in config.ts, use this
// function in pageEmbedToken instead of the allowed-origin check, and see CHAT_BOT.md.
//
// export const verifyEmbedToken = (token: string | null | undefined) => {
//   if (!token || !config.embed.tokenSecret) return undefined;
//   const claims = verifyJwt(token, config.embed.tokenSecret);
//   return typeof claims?.chatBotId === "string" && claims.chatBotId ? claims.chatBotId : undefined;
// };
// ---------------------------------------------------------------------------------------------

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * API calls an embedded page may make: editing, testing and publishing its own chat bot, reading
 * other chat bots' names (Chat bot link block) and using the workspace's integration accounts.
 * Deleting chat bots, other chat bots' content and Google sign-in stay behind the real sign-in.
 */
const allowedApiCalls = (chatBotId: string): [string, RegExp][] => {
  const bot = `/api/v1/chat-bots/${escapeRegExp(chatBotId)}`;
  return [
    ["GET", /^\/api\/v1\/chat-bots$/],
    ["GET", new RegExp(`^${bot}$`)],
    ["PATCH", new RegExp(`^${bot}$`)],
    ["GET", new RegExp(`^${bot}/published$`)],
    ["POST", new RegExp(`^${bot}/(publish|unpublish|assets|preview/startChat)$`)],
    ["GET", /^\/api\/v1\/credentials$/],
    ["POST", /^\/api\/v1\/credentials$/],
    ["GET", /^\/api\/v1\/credentials\/[\w-]+\/google-sheets\/[\w-]+\/sheets$/],
  ];
};

export const isEmbedApiCallAllowed = (req: IncomingMessage, method: string, pathname: string) => {
  const header = req.headers[EMBED_TOKEN_HEADER];
  const chatBotId = verifyEmbedToken(Array.isArray(header) ? header[0] : header);
  return !!chatBotId && allowedApiCalls(chatBotId).some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(pathname));
};

/** The page that opened this request is on an allowed parent site. */
const isFromAllowedParent = (req: IncomingMessage) => {
  const { allowedOrigins } = config.embed;
  if (!allowedOrigins.length) return false;
  // Only iframe loads (browsers send Sec-Fetch-Dest; older ones don't).
  const destination = req.headers["sec-fetch-dest"];
  if (destination && destination !== "iframe") return false;
  const referer = req.headers.referer;
  if (!referer) return false;
  try {
    return allowedOrigins.includes(new URL(referer).origin);
  } catch {
    return false;
  }
};

/**
 * The embed key for this page, when it may be shown embedded without sign-in:
 *  - builder:  /chat-bots/:id or /chat-bots/:id/edit ?embed=true, framed by an allowed site
 *  - Web Chat designer preview inside it: /chat/…?preview=1&chatBotId=:id&token=<its key>
 */
export const pageEmbedToken = (req: IncomingMessage, url: URL) => {
  const builder = url.pathname.match(/^\/chat-bots\/([^/]+)(?:\/edit)?$/);
  if (builder && url.searchParams.get("embed") === "true") return isFromAllowedParent(req) ? createEmbedKey(decodeURIComponent(builder[1]!)) : undefined;
  if (url.pathname.startsWith("/chat/") && url.searchParams.get("preview") === "1") {
    const token = url.searchParams.get("token");
    const chatBotId = url.searchParams.get("chatBotId");
    return chatBotId && verifyEmbedToken(token) === chatBotId ? token! : undefined;
  }
  return undefined;
};

/** Which sites may frame the embedded builder (Content-Security-Policy frame-ancestors). */
export const embedFrameAncestors = () => config.embed.allowedOrigins.join(" ");
