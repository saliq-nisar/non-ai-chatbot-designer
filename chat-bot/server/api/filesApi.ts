import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { config } from "../config.js";
import { findSession } from "../db/conversations.js";
import type { SessionState } from "../engine/types.js";
import { badRequest, HttpError, notFound, publicOrigin, type Route, sendJson } from "../http.js";

/**
 * File input uploads. The chat UI sends the raw file to
 *   POST /api/v1/sessions/{sessionId}/files?fileName=…
 * The file is stored under UPLOADS_DIR/<chat bot id>/<conversation id>/ with a random name
 * and served back from /files/…; the returned URL is the visitor's answer.
 */

export const uploadsRoot = resolve(config.uploads.directory);

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".json": "application/json",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const safeFileName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-100) || "file";

/** Streams the request body to disk, stopping when it exceeds the size limit. */
export const saveBody = (req: IncomingMessage, path: string, maxBytes: number) =>
  new Promise<void>((resolveSave, reject) => {
    const file = createWriteStream(path);
    let size = 0;
    let failed = false;
    const fail = (error: Error) => {
      if (failed) return;
      failed = true;
      file.destroy();
      if (existsSync(path)) unlinkSync(path);
      reject(error);
    };
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.unpipe(file);
        req.resume();
        fail(new HttpError(413, `File is larger than ${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MB`));
      }
    });
    req.on("error", fail);
    file.on("error", fail);
    file.on("finish", () => (size > maxBytes ? undefined : resolveSave()));
    req.pipe(file);
  });

export const filesRoutes: Route[] = [
  {
    method: "POST",
    pattern: /^\/api\/v1\/sessions\/([\w-]+)\/files$/,
    handler: async ({ req, res, url, params }) => {
      const session = await findSession(params[0]!);
      if (!session || session.state.engine !== "chat-bot/2") throw notFound("Session not found.");
      const state = session.state as SessionState;
      const fileName = url.searchParams.get("fileName");
      if (!fileName) throw badRequest("`fileName` is required");

      const flow = state.flows[state.currentFlowId];
      const block = flow?.groups.flatMap((group) => group.blocks).find((b) => b.id === state.currentBlockId);
      if (block?.type !== "file input") throw badRequest("This conversation is not waiting for a file");
      const allowed = block.options?.allowedFileTypes as { isEnabled?: boolean; types?: string[] } | undefined;
      const extension = extname(fileName).slice(1).toLowerCase();
      if (allowed?.isEnabled && allowed.types?.length && !allowed.types.some((type) => type.replace(/^\./, "").toLowerCase() === extension))
        throw badRequest(`Allowed file types: ${allowed.types.join(", ")}`);

      const folder = join(uploadsRoot, safeFileName(state.rootFlowId), safeFileName(state.resultId ?? `test-${params[0]}`));
      mkdirSync(folder, { recursive: true });
      const storedName = `${randomBytes(8).toString("hex")}-${safeFileName(fileName)}`;
      await saveBody(req, join(folder, storedName), config.uploads.maxSizeMb * 1024 * 1024);

      const relative = [safeFileName(state.rootFlowId), safeFileName(state.resultId ?? `test-${params[0]}`), storedName].map(encodeURIComponent).join("/");
      sendJson(res, 200, { url: `${publicOrigin(req)}/files/${relative}` });
    },
  },
];

/** GET /files/… — uploaded files (URLs contain a random part and are not listed anywhere). */
export const serveUploadedFile = (res: ServerResponse, pathname: string) => {
  const filePath = resolve(uploadsRoot, `.${decodeURIComponent(pathname.slice("/files".length))}`);
  if (!filePath.startsWith(uploadsRoot + sep) || !existsSync(filePath) || !statSync(filePath).isFile()) return sendJson(res, 404, { message: "Not found" });
  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
    // Never render uploaded HTML/SVG as a page of this app.
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    ...(contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.startsWith("audio/") || contentType === "application/pdf" ? {} : { "Content-Disposition": "attachment" }),
  });
  createReadStream(filePath).pipe(res);
};
