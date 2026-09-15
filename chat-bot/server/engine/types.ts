import type { Block, ChatBotEvent, ChatBotSettings, ChatBubble, ClientSideAction, Edge, Group, Variable } from "../../shared/types.js";

/** A runnable flow: a snapshot of a published chat bot taken when the chat started. */
export type Flow = {
  chatBotId: string;
  version: string;
  groups: Group[];
  edges: Edge[];
  events: ChatBotEvent[];
  variables: Variable[];
  settings: ChatBotSettings;
};

/** Where the flow goes next: a group of a flow, starting at a block index. */
export type Target = { groupId: string; blockIndex: number };

/**
 * Where to go when the current path ends. Used by reply/invalid-reply/command events
 * (come back to the conversation), and by "Chat bot link" (come back to the parent bot).
 */
export type Continuation = {
  flowId: string;
  target?: Target;
  /** Linked bot finished: copy variables with the same name back into the parent. */
  mergeVariablesFromFlowId?: string;
};

/** Stored as JSON in "ChatSession"."state". */
export type SessionState = {
  engine: "chat-bot/2";
  workspaceId: string;
  publicId: string;
  publishedChatBotId: string;
  /** Undefined for test sessions (nothing is recorded). */
  resultId?: string;
  isTest: boolean;
  /** The chat bot the conversation started with. */
  rootFlowId: string;
  /** Flow currently running (root, or a linked chat bot). */
  currentFlowId: string;
  /** Root flow plus every chat bot it links to. */
  flows: Record<string, Flow>;
  /** Block waiting for the visitor (input, or a paused client action); undefined when the conversation ended. */
  currentBlockId?: string;
  continuations: Continuation[];
  /** Set by Jump, used by Return. */
  returnTarget?: { flowId: string; target: Target };
  answers: { blockId: string; key: string; value: string }[];
  /** Conversation lines, for the "Transcript" set-variable type. */
  transcript: { role: "bot" | "user"; text: string }[];
  allowedOrigins?: string[];
};

export type ChatInput = Block & { prefilledValue?: string; runtimeOptions?: unknown };

export type LogLine = { status: "success" | "error" | "info"; description: string; details?: string };

/** What one engine step produced. */
export type StepResult = {
  state: SessionState;
  messages: ChatBubble[];
  input?: ChatInput;
  clientSideActions: ClientSideAction[];
  /** Answers to record for the result. */
  answers: { blockId: string; content: string }[];
  lastMessageNewFormat?: string;
  logs: LogLine[];
};

export type VariableUpdate = { id: string; value: Variable["value"] };

/** Result of an integration block (HTTP request, email, Google Sheets, Gmail…). */
export type IntegrationResult = {
  variables?: VariableUpdate[];
  clientSideActions?: ClientSideAction[];
  logs?: LogLine[];
};

/**
 * Side effects the engine needs, provided by the server (server/integrations).
 * Keeps the engine free of network and database code.
 */
export type EngineServices = {
  runIntegration: (block: Block, context: { state: SessionState; flow: Flow }) => Promise<IntegrationResult>;
  /** Extra data an input needs before it is shown (e.g. Stripe payment intent). */
  prepareInput: (block: Block, context: { state: SessionState; flow: Flow }) => Promise<{ runtimeOptions?: unknown }>;
};
