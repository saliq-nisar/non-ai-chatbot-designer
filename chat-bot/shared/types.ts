/**
 * Chat Bot data model — mirrors the structure stored by the existing backend
 * (version 6 / 6.1 format). Field names are the backend's and must not change.
 */

export type Coordinates = { x: number; y: number };

export type Variable = {
  id: string;
  name: string;
  value?: string | (string | null)[] | null;
  isSessionVariable?: boolean;
};

export type BlockSource = { blockId: string; itemId?: string; pathId?: string };
export type EventSource = { eventId: string };
export type EdgeSource = BlockSource | EventSource;

export type Edge = {
  id: string;
  from: EdgeSource;
  to: { groupId: string; blockId?: string };
};

export type Item = {
  id: string;
  outgoingEdgeId?: string;
  [field: string]: unknown;
};

/**
 * A block. `type` identifies it (e.g. "text", "choice input", "Condition").
 * Blocks the builder has no dedicated editor for are kept exactly as received.
 */
export type Block = {
  id: string;
  type: string;
  outgoingEdgeId?: string;
  content?: Record<string, unknown>;
  options?: Record<string, unknown>;
  items?: Item[];
};

export type Group = {
  id: string;
  title: string;
  graphCoordinates: Coordinates;
  blocks: Block[];
};

export type ChatBotEvent = {
  id: string;
  type: string;
  graphCoordinates: Coordinates;
  outgoingEdgeId?: string;
  options?: Record<string, unknown>;
};

type ContainerTheme = {
  backgroundColor?: string;
  color?: string;
  border?: { thickness?: number; color?: string; roundeness?: "none" | "medium" | "large" | "custom"; customRoundeness?: number };
};

/** Appearance saved with the chat bot (`theme` column). */
export type ChatBotTheme = {
  general?: {
    font?: string | { type: "Google" | "Custom"; family?: string };
    background?: { type?: "Color" | "Image" | "None"; content?: string };
  };
  chat?: {
    container?: ContainerTheme & { maxWidth?: string };
    hostAvatar?: { isEnabled?: boolean; url?: string };
    guestAvatar?: { isEnabled?: boolean; url?: string };
    hostBubbles?: ContainerTheme;
    guestBubbles?: ContainerTheme;
    buttons?: ContainerTheme;
    inputs?: ContainerTheme & { placeholderColor?: string };
    buttonsInput?: { layout?: "wrap" | "vertical" };
  };
  customCss?: string;
};

export type ChatBotSettings = {
  general?: Record<string, unknown>;
  typingEmulation?: {
    enabled?: boolean;
    speed?: number;
    maxDelay?: number;
    delayBetweenBubbles?: number;
    isDisabledOnFirstMessage?: boolean;
  };
  metadata?: { title?: string; description?: string; [field: string]: unknown };
  [section: string]: unknown;
};

export type ChatBot = {
  id: string;
  version: string;
  name: string;
  icon: string | null;
  groups: Group[];
  events: ChatBotEvent[];
  edges: Edge[];
  variables: Variable[];
  theme: ChatBotTheme;
  settings: ChatBotSettings;
  publicId: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
};

export type ChatBotSummary = {
  id: string;
  name: string;
  icon: string | null;
  publishedChatBotId?: string;
};

export type PublishedChatBot = {
  id: string;
  chatBotId: string;
  version: string;
  updatedAt?: string;
};

/** Fields the builder is allowed to change through PATCH. */
export type ChatBotUpdate = Partial<
  Pick<ChatBot, "name" | "icon" | "groups" | "events" | "edges" | "variables" | "theme" | "settings" | "publicId" | "updatedAt">
>;

// ---- Chat runtime (startChat / continueChat) ---------------------------------

export type RichTextNode = {
  type?: string;
  text?: string;
  url?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  children?: RichTextNode[];
};

export type ChatBubble =
  | { id: string; type: "text"; content: { type: "richText"; richText: RichTextNode[] } | { type: "markdown"; markdown: string } }
  | { id: string; type: "image"; content: { url?: string; clickLink?: { url?: string; alt?: string } } }
  | { id: string; type: "video"; content: { url?: string; type?: string; id?: string; height?: number | string; aspectRatio?: string } }
  | { id: string; type: "audio"; content: { url?: string; isAutoplayEnabled?: boolean } }
  | { id: string; type: "embed"; content: { url?: string; height?: number | string } }
  | { id: string; type: "custom-embed"; content: Record<string, unknown> };

export type ChatInput = Block & {
  prefilledValue?: string;
  runtimeOptions?: unknown;
};

export type ClientSideAction = {
  type: string;
  lastBubbleBlockId?: string;
  expectsDedicatedReply?: boolean;
  wait?: { secondsToWaitFor: number };
  redirect?: { url?: string; isNewTab?: boolean };
  /** Code block, analytics and support widgets: JavaScript run in the browser. */
  scriptToExecute?: { content: string; args: { id: string; value: unknown }[] };
  /** Run on the website hosting the Web Chat instead of inside the chat window. */
  shouldExecuteInParentContext?: boolean;
  [field: string]: unknown;
};

export type ChatReply = {
  messages: ChatBubble[];
  input?: ChatInput;
  clientSideActions?: ClientSideAction[];
  lastMessageNewFormat?: string;
  progress?: number;
  dynamicTheme?: { hostAvatarUrl?: string; guestAvatarUrl?: string; backgroundUrl?: string };
};

export type StartChatReply = ChatReply & {
  sessionId: string;
  resultId?: string;
  /** Live agent: token and Socket.IO host for receiving agent messages (when enabled on the server). */
  widgetSocketToken?: string;
  liveAgentSocketHost?: string;
  chatBot: { id: string; theme: ChatBotTheme; settings: Pick<ChatBotSettings, "general" | "typingEmulation"> };
};

export type ChatMessage = { type: "text"; text: string };
