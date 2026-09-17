import type { IncomingMessage } from "node:http";
import { CHAT_BOT_LINK_TYPE } from "../../shared/blockTypes.js";
import { createId } from "../../shared/createId.js";
import { resolveWebChatConfig } from "../../shared/webChat.js";
import type { ChatBot, ChatBubble } from "../../shared/types.js";
import { config } from "../config.js";
import { findChatBot, findPublishedChatBots, findRunnableChatBot, type PublishedRow } from "../db/chatBots.js";
import * as conversations from "../db/conversations.js";
import { transaction } from "../db/database.js";
import { toMarkdownBubble } from "../engine/bubbles.js";
import { continueFlow, type Reply, startFlow } from "../engine/flow.js";
import { rootFlow } from "../engine/state.js";
import type { Flow, SessionState, StepResult } from "../engine/types.js";
import { applyPrefilledVariables } from "../engine/variables.js";
import { badRequest, HttpError, isObject, notFound, readJsonObject, type Route, sendJson } from "../http.js";
import { queueChatWebhook } from "../integrations/chatWebhook.js";
import { resolveClientIp } from "../integrations/clientIp.js";
import { engineServices } from "../integrations/engineServices.js";
import { createLiveAgentConnection } from "../integrations/liveAgent.js";
import { saveWebChatContact } from "../integrations/webChatContact.js";
import { hasValidSession } from "../session.js";

/**
 * Chat runtime API (public): startChat, continueChat and liveAgentMessage.
 * Conversations from the builder's Test panel (header `X-Chat-Bot-Mode: test`, signed-in
 * users only) are not recorded and trigger no webhook, contact save, email or live-agent token.
 */

const BOT_CLOSED_MESSAGE = "This bot is now closed";
const MAX_LINKED_CHAT_BOTS = 20;

/** Accepted messages: a string, { type: "text", text }, or { type: "command", command }. */
const readMessage = (value: unknown): Reply | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return { type: "text", text: value };
  if (isObject(value) && value.type === "text" && typeof value.text === "string")
    return { type: "text", text: value.text, replyId: isObject(value.metadata) && typeof value.metadata.replyId === "string" ? value.metadata.replyId : undefined };
  if (isObject(value) && value.type === "command" && typeof value.command === "string") return { type: "command", command: value.command };
  throw badRequest("Unsupported message");
};

const messageText = (message: Reply | undefined) =>
  message?.type === "text" ? message.text : message?.type === "command" ? `[command: ${message.command}]` : undefined;

const isTestRequest = (req: IncomingMessage) => req.headers["x-chat-bot-mode"] === "test" && hasValidSession(req);

/**
 * Same rule as the previous system: contact save, chat webhook and live-agent token only
 * for conversations running in a browser (Web Chat, chat page). Browsers always send
 * `Origin` on POST; server-to-server API calls don't.
 */
const isFromBrowser = (req: IncomingMessage) => !!req.headers.origin;

/**
 * Allowed origins (settings.security.allowedOrigins) restrict which sites may run the chat.
 * The Web Chat iframe reports the page it is embedded in with `x-chat-bot-embed-origin`.
 */
const assertOriginAllowed = (req: IncomingMessage, allowedOrigins: string[] | undefined) => {
  if (!allowedOrigins?.length) return;
  const origin = req.headers.origin;
  const embedOrigin = req.headers["x-chat-bot-embed-origin"]?.toString();
  if (!origin || allowedOrigins.includes(origin) || (embedOrigin && allowedOrigins.includes(embedOrigin))) return;
  throw new HttpError(403, "Origin not allowed");
};

const expectsReply = (step: StepResult) => !!step.input || step.clientSideActions.some((action) => action.expectsDedicatedReply);

const formatMessages = (messages: ChatBubble[], format: unknown) => (format === "markdown" ? messages.map(toMarkdownBubble) : messages);

const toFlow = (row: Omit<PublishedRow, "id" | "createdAt">): Flow => ({
  chatBotId: row.chatBotId,
  version: row.version ?? "6",
  groups: row.groups,
  edges: row.edges,
  events: row.events ?? [],
  variables: row.variables,
  settings: row.settings,
});

/** Loads every published chat bot reachable through "Chat bot link" blocks. */
const loadLinkedFlows = async (root: Flow, workspaceId: string) => {
  const flows: Record<string, Flow> = { [root.chatBotId]: root };
  let pending = [root];
  while (pending.length && Object.keys(flows).length <= MAX_LINKED_CHAT_BOTS) {
    const ids = [
      ...new Set(
        pending.flatMap((flow) =>
          flow.groups.flatMap((group) => group.blocks.filter((block) => block.type === CHAT_BOT_LINK_TYPE).map((block) => block.options?.chatBotId as string | undefined)),
        ),
      ),
    ].filter((id): id is string => !!id && id !== "current" && !flows[id]);
    pending = (await findPublishedChatBots(ids, workspaceId)).map(toFlow);
    for (const flow of pending) flows[flow.chatBotId] = flow;
  }
  return flows;
};

type StartSource = Omit<PublishedRow, "id" | "createdAt">;

/** Creates the conversation state and runs the flow up to the first question (answering it when a message was sent). */
const runFirstStep = async ({
  root,
  message,
  state,
}: {
  root: Flow;
  message: Reply | undefined;
  state: Pick<SessionState, "workspaceId" | "publicId" | "publishedChatBotId" | "resultId" | "isTest" | "allowedOrigins">;
}) => {
  const initialState: SessionState = {
    engine: "chat-bot/2",
    ...state,
    rootFlowId: root.chatBotId,
    currentFlowId: root.chatBotId,
    flows: await loadLinkedFlows(root, state.workspaceId),
    continuations: [],
    answers: [],
    transcript: [],
  };
  let step = await startFlow(initialState, engineServices);
  if (message && expectsReply(step)) {
    const next = await continueFlow(step.state, message, engineServices);
    step = {
      ...next,
      messages: [...step.messages, ...next.messages],
      clientSideActions: [...step.clientSideActions, ...next.clientSideActions],
      logs: [...step.logs, ...next.logs],
    };
  }
  return { sessionId: createId(), step };
};

const saveFirstStep = (sessionId: string, step: StepResult) =>
  transaction(async (db) => {
    await conversations.insertSession(db, sessionId, step.state);
    if (step.state.resultId) {
      await conversations.upsertResult(db, {
        resultId: step.state.resultId,
        chatBotId: step.state.rootFlowId,
        variables: rootFlow(step.state).variables,
        isCompleted: !expectsReply(step) && step.state.answers.length > 0,
        hasStarted: step.state.answers.length > 0,
        sessionId,
      });
      await conversations.insertAnswers(db, step.state.resultId, step.answers);
    }
  });

const startReply = ({ sessionId, step, source, textBubbleContentFormat }: { sessionId: string; step: StepResult; source: StartSource; textBubbleContentFormat: unknown }) => ({
  sessionId,
  resultId: step.state.resultId,
  chatBot: {
    id: source.chatBotId,
    version: source.version,
    theme: source.theme,
    settings: { general: source.settings.general, typingEmulation: source.settings.typingEmulation },
    publishedAt: source.updatedAt.toISOString(),
  },
  // The visitor can write to a live agent after the flow only when messages are delivered somewhere.
  isLiveAgentEnabled: !!config.chatWebhookUrl,
  messages: formatMessages(step.messages, textBubbleContentFormat),
  input: step.input,
  clientSideActions: step.clientSideActions.length ? step.clientSideActions : undefined,
  lastMessageNewFormat: step.lastMessageNewFormat,
  logs: logsForResponse(step),
});

/** Execution logs are returned to the Test panel only. */
const logsForResponse = (step: StepResult) => (step.state.isTest && step.logs.length ? step.logs : undefined);

export const chatApiRoutes: Route[] = [
  /** Web Chat look & behavior of a published chat bot (loaded by the Web Chat script). */
  {
    method: "GET",
    pattern: /^\/api\/v1\/chat-bots\/([\w.-]+)\/webChat$/,
    handler: async ({ res, params }) => {
      const published = await findRunnableChatBot(params[0]!);
      if (!published || published.isArchived) throw notFound("Chat bot not found");
      sendJson(res, 200, { config: resolveWebChatConfig(published.settings.webChat, published.name) }, { "Cache-Control": "public, max-age=60" });
    },
  },

  {
    method: "POST",
    pattern: /^\/api\/v1\/chat-bots\/([\w.-]+)\/startChat$/,
    handler: async ({ req, res, params }) => {
      const publicId = params[0]!;
      const body = await readJsonObject(req);
      const message = readMessage(body.message);
      const isTest = isTestRequest(req);

      const published = await findRunnableChatBot(publicId);
      if (!published || published.isArchived) throw notFound("Chat bot not found");
      if (published.isSuspended || published.isQuarantined) throw new HttpError(403, BOT_CLOSED_MESSAGE);
      if (published.isClosed) {
        const systemMessages = published.settings.general?.systemMessages as { botClosed?: string } | undefined;
        throw badRequest(systemMessages?.botClosed ?? BOT_CLOSED_MESSAGE);
      }
      const allowedOrigins = (published.settings.security as { allowedOrigins?: string[] } | undefined)?.allowedOrigins;

      // Same order as the previous system: contact save → run flow → queue webhook → origin check → save.
      const isBrowserChat = !isTest && isFromBrowser(req);
      const ip = isBrowserChat ? await resolveClientIp(req) : undefined;
      const contactVariables = isBrowserChat ? await saveWebChatContact({ ip, publicId }) : {};
      const prefilled = { ...contactVariables, ...(isObject(body.prefilledVariables) ? body.prefilledVariables : {}) };

      const root = toFlow(published);
      root.variables = applyPrefilledVariables(root.variables, prefilled);
      const { sessionId, step } = await runFirstStep({
        root,
        message,
        state: { workspaceId: published.workspaceId, publicId, publishedChatBotId: published.id, resultId: isTest ? undefined : createId(), isTest, allowedOrigins },
      });

      if (isBrowserChat)
        queueChatWebhook({ ip, userMessage: messageText(message), botMessages: step.messages, resultId: step.state.resultId, publicId, isBotActivated: expectsReply(step) });

      assertOriginAllowed(req, allowedOrigins);

      await saveFirstStep(sessionId, step);

      sendJson(res, 200, {
        ...startReply({ sessionId, step, source: published, textBubbleContentFormat: body.textBubbleContentFormat }),
        ...(isBrowserChat && step.state.resultId ? createLiveAgentConnection(step.state.resultId) : {}),
      });
    },
  },

  /**
   * Builder Test panel (signed-in only): runs the chat bot as currently shown in the editor —
   * unsaved and unpublished changes included (`chatBot` in the body). Nothing is recorded,
   * and no webhook, contact save, email or live-agent connection happens.
   */
  {
    method: "POST",
    pattern: /^\/api\/v1\/chat-bots\/([\w-]+)\/preview\/startChat$/,
    requiresAuth: true,
    handler: async ({ req, res, params }) => {
      const body = await readJsonObject(req);
      const message = readMessage(body.message);
      const saved = await findChatBot(params[0]!);
      if (!saved) throw notFound("Chat bot not found");
      const draft = isObject(body.chatBot) ? body.chatBot : {};
      const pick = <K extends keyof ChatBot>(key: K): ChatBot[K] => (draft[key as string] !== undefined ? (draft[key as string] as ChatBot[K]) : saved[key]);
      if (![pick("groups"), pick("edges"), pick("events"), pick("variables")].every(Array.isArray)) throw badRequest("Invalid chat bot");

      const source = {
        chatBotId: saved.id,
        version: saved.version,
        groups: pick("groups"),
        edges: pick("edges"),
        events: pick("events"),
        variables: pick("variables"),
        theme: pick("theme") ?? {},
        settings: pick("settings") ?? {},
        updatedAt: new Date(),
      };
      const root = toFlow(source);
      root.variables = applyPrefilledVariables(root.variables, isObject(body.prefilledVariables) ? body.prefilledVariables : {});
      const { sessionId, step } = await runFirstStep({
        root,
        message,
        state: { workspaceId: saved.workspaceId, publicId: saved.publicId ?? undefined, resultId: undefined, isTest: true },
      });
      await saveFirstStep(sessionId, step);
      sendJson(res, 200, startReply({ sessionId, step, source, textBubbleContentFormat: body.textBubbleContentFormat }));
    },
  },

  {
    method: "POST",
    pattern: /^\/api\/v1\/sessions\/([\w-]+)\/continueChat$/,
    handler: async ({ req, res, params }) => {
      const sessionId = params[0]!;
      const body = await readJsonObject(req);
      const message = readMessage(body.message);

      const session = await conversations.findSession(sessionId);
      if (!session || session.state.engine !== "chat-bot/2") throw notFound("Session not found.");
      const state = session.state as SessionState;
      assertOriginAllowed(req, state.allowedOrigins);

      const step = await continueFlow(state, message, engineServices);
      const isFinished = !expectsReply(step);

      // Same order as the previous system: webhook is queued before the conversation is saved.
      if (!step.state.isTest && isFromBrowser(req))
        queueChatWebhook({
          ip: await resolveClientIp(req),
          userMessage: messageText(message),
          botMessages: step.messages,
          sessionId,
          resultId: step.state.resultId,
          publicId: step.state.publicId,
          isBotActivated: !isFinished,
        });

      await transaction(async (db) => {
        // Finished recorded conversations free their session; test sessions stay until restarted.
        const saved = await conversations.saveSession(db, sessionId, session.version, isFinished && step.state.resultId ? undefined : step.state);
        if (!saved) throw new HttpError(409, "This conversation was updated by another request. Please try again.");
        if (step.state.resultId) {
          await conversations.upsertResult(db, {
            resultId: step.state.resultId,
            chatBotId: step.state.rootFlowId,
            variables: rootFlow(step.state).variables,
            isCompleted: isFinished && step.state.answers.length > 0,
            hasStarted: step.state.answers.length > 0,
            sessionId,
          });
          await conversations.insertAnswers(db, step.state.resultId, step.answers);
        }
      });

      sendJson(res, 200, {
        // Same ids as in startChat. resultId is the live-agent room (room:{resultId}_web); absent for test conversations.
        sessionId,
        resultId: step.state.resultId,
        messages: formatMessages(step.messages, body.textBubbleContentFormat),
        input: step.input,
        clientSideActions: step.clientSideActions.length ? step.clientSideActions : undefined,
        lastMessageNewFormat: step.lastMessageNewFormat,
        logs: logsForResponse(step),
      });
    },
  },

  /**
   * Visitor message after the bot stopped driving the conversation (flow ended, or a live
   * agent took over): relayed to the chat webhook, never through the flow.
   */
  {
    method: "POST",
    pattern: /^\/api\/v1\/sessions\/([\w-]+)\/liveAgentMessage$/,
    handler: async ({ req, res, params }) => {
      const sessionId = params[0]!;
      const { message } = await readJsonObject(req);
      if (typeof message !== "string" || message.trim() === "") throw badRequest("`message` must be a non-empty string");
      const result = await conversations.findResultBySessionId(sessionId);
      if (!result) {
        // Test conversations are not recorded: there is nothing to relay.
        const session = await conversations.findSession(sessionId);
        if (session && (session.state as SessionState).isTest) return sendJson(res, 200, { message: "success" });
        throw notFound("Session not found.");
      }
      queueChatWebhook({
        ip: await resolveClientIp(req),
        userMessage: message.trim(),
        botMessages: [],
        sessionId,
        resultId: result.id,
        publicId: result.publicId ?? undefined,
        isBotActivated: false,
      });
      sendJson(res, 200, { message: "success" });
    },
  },
];
