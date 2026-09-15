import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { createId } from "../../shared/createId.js";
import { isValidPublicId } from "../../shared/publicId.js";
import type { ChatBot } from "../../shared/types.js";
import * as chatBots from "../db/chatBots.js";
import { badRequest, HttpError, isObject, notFound, publicOrigin, readJsonObject, type Route, sendJson } from "../http.js";
import { safeFileName, saveBody, uploadsRoot } from "./filesApi.js";

/**
 * Chat Bot management API. Paths and JSON keys ("typebot", "typebots", "publishedTypebot")
 * are the existing API contract and stay unchanged for existing clients.
 * Authorization (session cookie or API token) is checked by the server before these run.
 */

const LATEST_VERSION = "6.1";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const SUPPORTED_VERSIONS = new Set(["6", "6.1"]);
const CONFLICT_MARGIN_MS = 5000; // tolerates small clock differences between clients

const loadChatBot = async (chatBotId: string) => {
  const bot = await chatBots.findChatBot(chatBotId);
  if (!bot) throw notFound("Chat bot not found");
  return bot;
};

const assertWorkspace = async (workspaceId: unknown) => {
  if (typeof workspaceId !== "string" || !(await chatBots.workspaceExists(workspaceId))) throw notFound("Workspace not found");
  return workspaceId;
};

/** Validates the structure of the editable fields that are present. */
const readChatBotFields = (input: unknown): chatBots.ChatBotChanges => {
  if (!isObject(input)) throw badRequest("`typebot` must be an object");
  const changes: chatBots.ChatBotChanges = {};
  const arrayField = (key: "groups" | "edges" | "variables" | "events") => {
    if (input[key] === undefined) return;
    if (!Array.isArray(input[key])) throw badRequest(`\`${key}\` must be an array`);
    changes[key] = input[key] as never;
  };
  arrayField("groups");
  arrayField("edges");
  arrayField("variables");
  arrayField("events");
  for (const group of changes.groups ?? [])
    if (!isObject(group) || typeof group.id !== "string" || !Array.isArray(group.blocks)) throw badRequest("Each group needs an `id` and a `blocks` array");
  for (const key of ["theme", "settings"] as const) {
    if (input[key] === undefined) continue;
    if (!isObject(input[key])) throw badRequest(`\`${key}\` must be an object`);
    changes[key] = input[key] as never;
  }
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") throw badRequest("`name` must be a non-empty string");
    changes.name = input.name.trim();
  }
  if (input.icon !== undefined) changes.icon = typeof input.icon === "string" ? input.icon : null;
  if (input.publicId !== undefined) {
    if (input.publicId !== null && (typeof input.publicId !== "string" || !isValidPublicId(input.publicId) || input.publicId === ""))
      throw badRequest("Public ID can only contain lowercase letters, numbers and dashes");
    changes.publicId = input.publicId;
  }
  if (typeof input.isClosed === "boolean") changes.isClosed = input.isClosed;
  return changes;
};

const assertPublicIdAvailable = async (publicId: string | null | undefined, chatBotId?: string) => {
  if (publicId && (await chatBots.isPublicIdTaken(publicId, chatBotId))) throw badRequest("Public ID not available");
};

const startEvent = () => [{ id: createId(), type: "start", graphCoordinates: { x: 0, y: 0 } }];

const serializePublished = (row: chatBots.PublishedRow) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const chatBotRoutes: Route[] = [
  // List chat bots
  {
    method: "GET",
    pattern: /^\/api\/v1\/typebots$/,
    handler: async ({ res, url }) => {
      const workspaceId = await assertWorkspace(url.searchParams.get("workspaceId"));
      const rows = await chatBots.listChatBots(workspaceId);
      sendJson(res, 200, {
        typebots: rows.map((row) => ({ ...row, publishedTypebotId: row.publishedTypebotId ?? undefined, accessRight: "write" })),
      });
    },
  },

  // Create chat bot
  {
    method: "POST",
    pattern: /^\/api\/v1\/typebots$/,
    handler: async ({ req, res }) => {
      const body = await readJsonObject(req);
      const workspaceId = await assertWorkspace(body.workspaceId);
      const fields = readChatBotFields(body.typebot ?? {});
      await assertPublicIdAvailable(fields.publicId);
      const chatBot = await chatBots.insertChatBot({
        id: createId(),
        version: LATEST_VERSION,
        workspaceId,
        name: fields.name ?? "My chat bot",
        icon: fields.icon ?? null,
        groups: fields.groups ?? [],
        events: fields.events?.length ? fields.events : startEvent(),
        edges: fields.edges ?? [],
        variables: fields.variables ?? [],
        theme: fields.theme ?? {},
        settings: fields.settings ?? {},
        publicId: fields.publicId ?? null,
      });
      sendJson(res, 200, { typebot: chatBot });
    },
  },

  // Import chat bot (exported JSON, version 6 format)
  {
    method: "POST",
    pattern: /^\/api\/v1\/typebots\/import$/,
    handler: async ({ req, res }) => {
      const body = await readJsonObject(req);
      const workspaceId = await assertWorkspace(body.workspaceId);
      if (!isObject(body.typebot)) throw badRequest("`typebot` must be the exported chat bot JSON");
      const version = String(body.typebot.version ?? "");
      if (!SUPPORTED_VERSIONS.has(version)) throw badRequest(`Unsupported chat bot version "${version || "unknown"}". Export it in version 6 format.`);
      const fields = readChatBotFields(body.typebot);
      const chatBot = await chatBots.insertChatBot({
        id: createId(),
        version,
        workspaceId,
        name: fields.name ?? "Imported chat bot",
        icon: fields.icon ?? null,
        groups: fields.groups ?? [],
        events: fields.events?.length ? fields.events : startEvent(),
        edges: fields.edges ?? [],
        variables: fields.variables ?? [],
        theme: fields.theme ?? {},
        settings: fields.settings ?? {},
        publicId: null, // an import never takes over another chat bot's public ID
      });
      sendJson(res, 200, { typebot: chatBot });
    },
  },

  // Get chat bot
  {
    method: "GET",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)$/,
    handler: async ({ res, params }) => {
      sendJson(res, 200, { typebot: await loadChatBot(params[0]!), currentUserMode: "write" });
    },
  },

  // Update chat bot
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)$/,
    handler: async ({ req, res, params }) => {
      const existing = await loadChatBot(params[0]!);
      const body = await readJsonObject(req);
      const fields = readChatBotFields(body.typebot);
      const clientUpdatedAt = isObject(body.typebot) && typeof body.typebot.updatedAt === "string" ? Date.parse(body.typebot.updatedAt) : NaN;
      if (!Number.isNaN(clientUpdatedAt) && body.overwrite !== true && Date.parse(existing.updatedAt) > clientUpdatedAt + CONFLICT_MARGIN_MS)
        throw new HttpError(409, "Found newer version of the chat bot in database");
      if (fields.publicId !== existing.publicId) await assertPublicIdAvailable(fields.publicId, existing.id);
      const chatBot: ChatBot = await chatBots.updateChatBot(existing.id, fields);
      sendJson(res, 200, { typebot: chatBot });
    },
  },

  // Delete chat bot
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)$/,
    handler: async ({ res, params }) => {
      const existing = await loadChatBot(params[0]!);
      await chatBots.archiveChatBot(existing.id);
      sendJson(res, 200, { message: "success" });
    },
  },

  // Get published chat bot
  {
    method: "GET",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)\/publishedTypebot$/,
    handler: async ({ res, params }) => {
      const existing = await loadChatBot(params[0]!);
      const published = await chatBots.findPublishedChatBot(existing.id);
      sendJson(res, 200, { publishedTypebot: published ? serializePublished(published) : null });
    },
  },

  // Publish chat bot
  {
    method: "POST",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)\/publish$/,
    handler: async ({ res, params }) => {
      const existing = await loadChatBot(params[0]!);
      if (!SUPPORTED_VERSIONS.has(existing.version)) throw badRequest(`Chat bots in version ${existing.version} format can't be published`);
      await chatBots.publishChatBot(existing, createId());
      sendJson(res, 200, { message: "success" });
    },
  },

  // Upload an image for the chat bot (Web Chat icon, avatars, image bubbles)
  {
    method: "POST",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)\/assets$/,
    handler: async ({ req, res, url, params }) => {
      const existing = await loadChatBot(params[0]!);
      const fileName = url.searchParams.get("fileName") ?? "";
      if (!IMAGE_EXTENSIONS.has(extname(fileName).toLowerCase())) throw badRequest("Only images can be uploaded (png, jpg, gif, webp, svg)");
      const folder = join(uploadsRoot, safeFileName(existing.id), "assets");
      mkdirSync(folder, { recursive: true });
      const storedName = `${randomBytes(8).toString("hex")}-${safeFileName(fileName)}`;
      await saveBody(req, join(folder, storedName), MAX_ASSET_BYTES);
      sendJson(res, 200, { url: `${publicOrigin(req)}/files/${encodeURIComponent(safeFileName(existing.id))}/assets/${encodeURIComponent(storedName)}` });
    },
  },

  // Unpublish chat bot
  {
    method: "POST",
    pattern: /^\/api\/v1\/typebots\/([\w-]+)\/unpublish$/,
    handler: async ({ res, params }) => {
      const existing = await loadChatBot(params[0]!);
      if (!(await chatBots.findPublishedChatBot(existing.id))) throw notFound("Published chat bot not found");
      await chatBots.unpublishChatBot(existing.id);
      sendJson(res, 200, { message: "success" });
    },
  },
];
