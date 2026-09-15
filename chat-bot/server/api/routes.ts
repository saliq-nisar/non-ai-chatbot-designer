import type { Route } from "../http.js";
import { chatApiRoutes as chatRoutes } from "./chatApi.js";
import { chatBotRoutes } from "./chatBotApi.js";
import { credentialsRoutes } from "./credentialsApi.js";
import { filesRoutes } from "./filesApi.js";

/**
 * Every /api/v1 endpoint. Management endpoints (chat bots, credentials) require sign-in or
 * the API token; chat endpoints (start/continue chat, live-agent message, file upload) are public.
 */
export const chatApiRoutes: Route[] = [
  ...chatBotRoutes.map((route) => ({ ...route, requiresAuth: true })),
  ...credentialsRoutes.map((route) => ({ ...route, requiresAuth: true })),
  ...chatRoutes,
  ...filesRoutes,
];
