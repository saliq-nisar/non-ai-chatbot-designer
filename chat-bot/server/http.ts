import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.js";

/** Small HTTP helpers shared by the API handlers. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message: string) => new HttpError(404, message);

export const sendJson = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
};

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => (size > MAX_BODY_BYTES ? reject(new HttpError(413, "Request body too large")) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });

/** Reads a JSON object body ({} when empty). */
export const readJsonObject = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const text = (await readBody(req)).toString();
  if (!text.trim()) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw badRequest("Request body is not valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw badRequest("Request body must be a JSON object");
  return data as Record<string, unknown>;
};

export type RouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: string[];
};

export type Route = {
  method: string;
  /** Capture groups become `params`. */
  pattern: RegExp;
  handler: (context: RouteContext) => Promise<void>;
  requiresAuth?: boolean;
};

export const findRoute = (routes: Route[], method: string, pathname: string) => {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (match) return { route, params: match.slice(1).map((param) => decodeURIComponent(param)) };
  }
  return undefined;
};

export const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Public URL of this app: CHAT_BOT_PUBLIC_URL, or the URL the request came in on (proxy-aware). */
export const publicOrigin = (req: IncomingMessage) => {
  if (config.publicUrl) return config.publicUrl;
  const proto = req.headers["x-forwarded-proto"]?.toString().split(",")[0]?.trim();
  const host = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim();
  return `${proto ?? "http"}://${host ?? req.headers.host ?? `localhost:${config.port}`}`;
};
