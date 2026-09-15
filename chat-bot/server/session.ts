import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { config } from "./config.js";
import { signJwt, verifyJwt } from "./jwt.js";

/**
 * Who may use the management API:
 *  - the browser app: login session cookie (HS256 JWT signed with NEXTAUTH_SECRET)
 *  - other systems: `Authorization: Bearer <API_TOKEN>`
 */
const COOKIE_NAME = "chat-bot-session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const createSessionCookie = (username: string) => {
  const token = signJwt({ sub: username }, config.sessionSecret, MAX_AGE_SECONDS);
  const secure = config.publicUrl?.startsWith("https:") ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
};

export const clearSessionCookie = () => `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;

export const hasValidSession = (req: IncomingMessage) => {
  const token = readCookie(req, COOKIE_NAME);
  return !!token && !!verifyJwt(token, config.sessionSecret);
};

export const hasValidApiToken = (req: IncomingMessage) => {
  const header = req.headers.authorization;
  return !!header?.startsWith("Bearer ") && safeEqual(header.slice(7), config.apiToken);
};

export const isAuthorized = (req: IncomingMessage) => hasValidSession(req) || hasValidApiToken(req);

export const areCredentialsValid = (username: unknown, password: unknown) =>
  typeof username === "string" &&
  typeof password === "string" &&
  username.trim().toLowerCase() === config.login.username.toLowerCase() &&
  safeEqual(password, config.login.password);

const readCookie = (req: IncomingMessage, name: string) => {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
};
