import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import type { ViteDevServer } from "vite";
import { serveUploadedFile } from "./api/filesApi.js";
import { chatApiRoutes } from "./api/routes.js";
import { config } from "./config.js";
import { embedFrameAncestors, isEmbedApiCallAllowed, pageEmbedToken } from "./embed.js";
import { pool } from "./db/database.js";
import { ensureSchema } from "./db/ensureSchema.js";
import { findRoute, HttpError, publicOrigin, readJsonObject, sendJson } from "./http.js";
import { closeChatWebhookQueue } from "./integrations/chatWebhook.js";
import { areCredentialsValid, clearSessionCookie, createSessionCookie, hasValidSession, isAuthorized } from "./session.js";
import { initializeWorkspace } from "./workspace.js";

/**
 * Chat Bot server — one process serves:
 *   /api/v1/...        the Chat Bot API (management + chat)
 *   /auth/login|logout the app's sign-in
 *   /web-chat.js       the embeddable Web Chat script
 *   /files/...         files uploaded by visitors (file input)
 *   everything else    the single-page app (list, builder, chat page)
 *
 * Startup: create missing tables -> seed/resolve the workspace -> listen.
 */

const ROOT = process.cwd();
const WEB_DIST = join(ROOT, "dist", "web");
const WIDGET_FILE = join(ROOT, "dist", "widget", "web-chat.js");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Chat-Bot-Mode, X-Chat-Bot-Embed-Origin",
};

/** Browser-visible runtime configuration, injected into index.html (mirrors web/config.ts). */
type PublicConfig = { workspaceId: string; appUrl: string; embedToken?: string };

const start = async () => {
  await ensureSchema();
  const workspaceId = await initializeWorkspace();
  const vite = config.isProduction ? undefined : await createViteDevServer();

  const server = createServer((req, res) => {
    handleRequest(req, res, { workspaceId, vite }).catch((error: unknown) => {
      if (error instanceof HttpError) {
        if (!res.headersSent) sendJson(res, error.status, { message: error.message }, API_CORS_HEADERS);
        return;
      }
      console.error("[server] unhandled error:", error);
      if (!res.headersSent) sendJson(res, 500, { message: "Internal server error" }, API_CORS_HEADERS);
      else res.end();
    });
  });

  server.listen(config.port, () => console.log(`[server] Chat Bot app listening on http://localhost:${config.port}`));

  const shutdown = () => {
    console.log("[server] shutting down");
    server.close();
    void Promise.allSettled([vite?.close(), closeChatWebhookQueue(), pool.end()]).then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

const handleRequest = async (req: IncomingMessage, res: ServerResponse, context: { workspaceId: string; vite?: ViteDevServer }) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const { pathname } = url;
  const method = req.method ?? "GET";
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (pathname.startsWith("/api/v1/")) {
    if (method === "OPTIONS") {
      res.writeHead(204, API_CORS_HEADERS);
      return res.end();
    }
    for (const [key, value] of Object.entries(API_CORS_HEADERS)) res.setHeader(key, value);
    const match = findRoute(chatApiRoutes, method, pathname);
    if (!match) return sendJson(res, 404, { message: "Not found" });
    if (match.route.requiresAuth && !isAuthorized(req) && !isEmbedApiCallAllowed(req, method, pathname))
      return sendJson(res, 401, { message: "Not signed in" });
    return match.route.handler({ req, res, url, params: match.params });
  }

  if (pathname === "/health") return sendJson(res, 200, { status: "ok", workspaceId: context.workspaceId });

  if (pathname === "/auth/login" && method === "POST") {
    const { username, password } = await readJsonObject(req);
    if (!areCredentialsValid(username, password)) return sendJson(res, 401, { message: "Invalid username or password" });
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie(config.login.username) });
  }
  if (pathname === "/auth/logout" && method === "POST") return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });

  if (method !== "GET" && method !== "HEAD") return sendJson(res, 405, { message: "Method not allowed" });

  if (pathname === "/web-chat.js") return serveWebChatScript(res, context.vite);
  if (pathname.startsWith("/files/")) return serveUploadedFile(res, pathname);

  if (context.vite) {
    // Development: let Vite serve modules/assets; it calls next() for anything it doesn't handle.
    const handledByVite = await new Promise<boolean>((done) => {
      res.once("finish", () => done(true));
      context.vite!.middlewares(req, res, () => done(false));
    });
    if (handledByVite) return;
  } else if (pathname.startsWith("/assets/")) {
    return serveStaticFile(res, pathname);
  }

  return servePage(req, res, url, context);
};

/** Every other GET renders the single-page app. Management pages require sign-in. */
const servePage = async (req: IncomingMessage, res: ServerResponse, url: URL, { workspaceId, vite }: { workspaceId: string; vite?: ViteDevServer }) => {
  const isChatPage = url.pathname.startsWith("/chat/");
  // Builder embedded by an allowed parent site: no sign-in, framing allowed (see server/embed.ts).
  const embedToken = pageEmbedToken(req, url);
  if (!isChatPage && url.pathname !== "/login" && !embedToken && !hasValidSession(req)) {
    res.writeHead(302, { Location: `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}` });
    return res.end();
  }

  const publicConfig: PublicConfig = { workspaceId, appUrl: publicOrigin(req), ...(embedToken ? { embedToken } : {}) };
  let html = vite
    ? await vite.transformIndexHtml(url.pathname, readFileSync(join(ROOT, "web", "index.html"), "utf8"))
    : readFileSync(join(WEB_DIST, "index.html"), "utf8");
  html = html.replace("<!--chat-bot-config-->", `<script>window.__CHAT_BOT_CONFIG__=${JSON.stringify(publicConfig).replace(/</g, "\\u003c")}</script>`);

  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[".html"]!,
    "Cache-Control": "no-store",
    // The chat page is embedded by the Web Chat iframe; the builder only by allowed parent sites; nothing else may be framed.
    ...(isChatPage ? {} : embedToken ? { "Content-Security-Policy": `frame-ancestors ${embedFrameAncestors()}` } : { "X-Frame-Options": "DENY" }),
  });
  res.end(html);
};

const serveWebChatScript = async (res: ServerResponse, vite?: ViteDevServer) => {
  let code: string;
  if (vite) {
    // Development: transpile on the fly (the script has no imports).
    const ts = (await import("typescript")).default;
    code = ts.transpileModule(readFileSync(join(ROOT, "widget", "webChat.ts"), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2019, moduleDetection: ts.ModuleDetectionKind.Legacy },
    }).outputText;
  } else {
    if (!existsSync(WIDGET_FILE)) return sendJson(res, 404, { message: "Web Chat script not built. Run npm run build." });
    code = readFileSync(WIDGET_FILE, "utf8");
  }
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[".js"]!,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": vite ? "no-store" : "public, max-age=300",
  });
  res.end(code);
};

const serveStaticFile = (res: ServerResponse, pathname: string) => {
  const filePath = resolve(WEB_DIST, `.${decodeURIComponent(pathname)}`);
  if (!filePath.startsWith(WEB_DIST + sep) || !existsSync(filePath) || !statSync(filePath).isFile()) return sendJson(res, 404, { message: "Not found" });
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
    // Vite adds a content hash to asset names, so they can be cached forever.
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(res);
};

const createViteDevServer = async () => {
  const { createServer: createVite } = await import("vite");
  return createVite({ server: { middlewareMode: true }, appType: "custom" });
};

start().catch((error) => {
  console.error("[server] failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
