import { CHAT_BOT_LINK_TYPE } from "../../../../../shared/blockTypes";
import type { ComponentType } from "react";
import type { Block, ChatBotEvent, Item, RichTextNode } from "../../../../api/types";
import { useVariableName } from "../inspector/fields";
import { useBuilder } from "../state/builderStore";
import { createId } from "../state/createId";
import { type BlockEditorProps, labels, option, richTextToLines } from "./blockHelpers";
import { AudioBubbleEditor, EmbedBubbleEditor, ImageBubbleEditor, TextBubbleEditor, VideoBubbleEditor } from "./editors/BubbleEditors";
import { ChoiceInputEditor } from "./editors/ChoiceEditors";
import { DateInputEditor, NumberInputEditor, RatingInputEditor, TextInputEditor } from "./editors/InputEditors";
import { JsonBlockEditor } from "./editors/JsonBlockEditor";
import { EmailEditor, GmailEditor } from "./editors/EmailEditors";
import { GoogleSheetsEditor } from "./editors/GoogleSheetsEditor";
import { HttpRequestEditor } from "./editors/HttpRequestEditor";
import {
  AbTestEditor,
  ChatBotLinkEditor,
  CodeEditor,
  ConditionEditor,
  JumpEditor,
  newConditionItem,
  RedirectEditor,
  SetVariableEditor,
  WaitEditor,
} from "./editors/LogicEditors";
import { CardsEditor, FileInputEditor, newCard, PaymentInputEditor } from "./editors/MoreInputEditors";
import { ChatwootEditor, GoogleAnalyticsEditor, PixelEditor } from "./editors/TrackingEditors";

/**
 * Block registry — everything the builder knows about a block type in one place:
 * palette label/category, default content, how it is summarized on the canvas,
 * and its editor. Add or customize a block type by editing its entry.
 * `type` values are the backend's block types and must not be changed.
 */
export type BlockCategory = "Bubbles" | "Inputs" | "Logic" | "Integrations";

export type BlockDefinition = {
  type: string;
  label: string;
  category: BlockCategory;
  create: () => Block;
  Summary: ComponentType<{ block: Block }>;
  Editor: ComponentType<BlockEditorProps>;
  /** Label of an item row (blocks with items show one outgoing port per item). */
  ItemLabel?: ComponentType<{ item: Item }>;
  /** Blocks that end the path (no outgoing port). */
  hasNoOutgoingPort?: boolean;
  /** Items whose buttons ("paths") each have their own port (cards). */
  hasItemPaths?: boolean;
};

const block = (type: string, fields: Partial<Block> = {}): Block => ({ id: createId(), type, ...fields });

const Muted = ({ children }: { children: string }) => <span className="block-node__muted">{children}</span>;

const SavesTo = ({ block: b }: { block: Block }) => {
  const name = useVariableName(option(b, "variableId"));
  return name ? <span className="block-node__variable">→ {name}</span> : null;
};

const InputSummary = ({ block: b }: { block: Block }) => (
  <>
    <Muted>{labels(b).placeholder || "Waits for the visitor's answer"}</Muted> <SavesTo block={b} />
  </>
);

const urlSummary = (key: "content" | "options") =>
  function UrlSummary({ block: b }: { block: Block }) {
    const url = b[key]?.url as string | undefined;
    return url ? <span className="block-node__ellipsis">{url}</span> : <Muted>Click to edit…</Muted>;
  };

const ConditionItemLabel = ({ item }: { item: Item }) => {
  const condition = item.content as { comparisons?: { variableId?: string; comparisonOperator?: string; value?: string }[] } | undefined;
  const first = condition?.comparisons?.[0];
  const variableName = useVariableName(first?.variableId);
  if (!first) return <Muted>Configure…</Muted>;
  const more = (condition?.comparisons?.length ?? 0) > 1 ? " …" : "";
  return (
    <span>
      If {variableName ?? "?"} {first.comparisonOperator ?? "Equal to"} {first.value ?? ""}
      {more}
    </span>
  );
};

const WebhookSummary = ({ block: b }: { block: Block }) => {
  const url = (option<{ url?: string }>(b, "webhook") ?? {}).url;
  return url ? <span className="block-node__ellipsis">{url}</span> : <Muted>Configure URL…</Muted>;
};

const JumpSummary = ({ block: b }: { block: Block }) => {
  const title = useBuilder((state) => state.chatBot.groups.find((group) => group.id === option(b, "groupId"))?.title);
  return title ? <span>Jump to {title}</span> : <Muted>Select a group…</Muted>;
};

const SetVariableSummary = ({ block: b }: { block: Block }) => {
  const name = useVariableName(option(b, "variableId"));
  return name ? <span>Set {name}</span> : <Muted>Click to edit…</Muted>;
};

export const blockDefinitions: BlockDefinition[] = [
  // ---- Bubbles ----
  {
    type: "text",
    label: "Text",
    category: "Bubbles",
    create: () => block("text", { content: { richText: [{ type: "p", children: [{ text: "" }] }] } }),
    Summary: ({ block: b }) => {
      const text = richTextToLines(b.content?.richText as RichTextNode[] | undefined).trim();
      return text ? <span className="block-node__text">{text}</span> : <Muted>Click to edit…</Muted>;
    },
    Editor: TextBubbleEditor,
  },
  { type: "image", label: "Image", category: "Bubbles", create: () => block("image", { content: {} }), Summary: urlSummary("content"), Editor: ImageBubbleEditor },
  { type: "video", label: "Video", category: "Bubbles", create: () => block("video", { content: {} }), Summary: urlSummary("content"), Editor: VideoBubbleEditor },
  { type: "audio", label: "Audio", category: "Bubbles", create: () => block("audio", { content: {} }), Summary: urlSummary("content"), Editor: AudioBubbleEditor },
  { type: "embed", label: "Embed", category: "Bubbles", create: () => block("embed", { content: { height: 400 } }), Summary: urlSummary("content"), Editor: EmbedBubbleEditor },

  // ---- Inputs ----
  { type: "text input", label: "Text", category: "Inputs", create: () => block("text input", { options: {} }), Summary: InputSummary, Editor: TextInputEditor },
  { type: "number input", label: "Number", category: "Inputs", create: () => block("number input", { options: {} }), Summary: InputSummary, Editor: NumberInputEditor },
  { type: "email input", label: "Email", category: "Inputs", create: () => block("email input", { options: {} }), Summary: InputSummary, Editor: TextInputEditor },
  { type: "url input", label: "Website", category: "Inputs", create: () => block("url input", { options: {} }), Summary: InputSummary, Editor: TextInputEditor },
  { type: "phone number input", label: "Phone", category: "Inputs", create: () => block("phone number input", { options: {} }), Summary: InputSummary, Editor: TextInputEditor },
  { type: "date input", label: "Date", category: "Inputs", create: () => block("date input", { options: {} }), Summary: InputSummary, Editor: DateInputEditor },
  { type: "time input", label: "Time", category: "Inputs", create: () => block("time input", { options: {} }), Summary: InputSummary, Editor: TextInputEditor },
  {
    type: "choice input",
    label: "Buttons",
    category: "Inputs",
    create: () => block("choice input", { items: [{ id: createId(), content: "Option 1" }] }),
    Summary: SavesTo,
    Editor: ChoiceInputEditor,
    ItemLabel: ({ item }) => <span>{(item.content as string) || "Click to edit…"}</span>,
  },
  {
    type: "picture choice input",
    label: "Pictures",
    category: "Inputs",
    create: () => block("picture choice input", { items: [{ id: createId() }] }),
    Summary: SavesTo,
    Editor: ChoiceInputEditor,
    ItemLabel: ({ item }) => <span>{(item.title as string) || (item.pictureSrc as string) || "Click to edit…"}</span>,
  },
  { type: "rating input", label: "Rating", category: "Inputs", create: () => block("rating input", { options: {} }), Summary: InputSummary, Editor: RatingInputEditor },

  // ---- Logic ----
  { type: "Set variable", label: "Set variable", category: "Logic", create: () => block("Set variable", { options: {} }), Summary: SetVariableSummary, Editor: SetVariableEditor },
  {
    type: "Condition",
    label: "Condition",
    category: "Logic",
    create: () => block("Condition", { items: [newConditionItem()] }),
    Summary: () => <Muted>Else</Muted>,
    Editor: ConditionEditor,
    ItemLabel: ConditionItemLabel,
  },
  { type: "Redirect", label: "Redirect", category: "Logic", create: () => block("Redirect", { options: {} }), Summary: urlSummary("options"), Editor: RedirectEditor },
  {
    type: "Wait",
    label: "Wait",
    category: "Logic",
    create: () => block("Wait", { options: { secondsToWaitFor: "1" } }),
    Summary: ({ block: b }) => <span>Wait {option<string>(b, "secondsToWaitFor") ?? "0"}s</span>,
    Editor: WaitEditor,
  },
  { type: "Jump", label: "Jump", category: "Logic", create: () => block("Jump", { options: {} }), Summary: JumpSummary, Editor: JumpEditor, hasNoOutgoingPort: true },
  {
    type: "Return",
    label: "Return",
    category: "Logic",
    create: () => block("Return"),
    Summary: () => <Muted>Back to the last Jump</Muted>,
    Editor: () => <p className="field__hint">Continues after the last Jump block that led here. Without a Jump, the path ends.</p>,
    hasNoOutgoingPort: true,
  },
  {
    type: "AB test",
    label: "A/B test",
    category: "Logic",
    create: () => block("AB test", { items: [{ id: createId(), path: "a" }, { id: createId(), path: "b" }], options: { aPercent: 50 } }),
    Summary: ({ block: b }) => <Muted>{`A ${option<number>(b, "aPercent") ?? 50}% · B ${100 - (option<number>(b, "aPercent") ?? 50)}%`}</Muted>,
    Editor: AbTestEditor,
    ItemLabel: ({ item }) => <span>{String(item.path ?? "").toUpperCase() || "Path"}</span>,
  },
  {
    type: "Code",
    label: "Code",
    category: "Logic",
    create: () => block("Code", { options: { name: "Script", isExecutedOnClient: true } }),
    Summary: ({ block: b }) => <span>{option<string>(b, "name") || "Script"}</span>,
    Editor: CodeEditor,
  },
  {
    type: CHAT_BOT_LINK_TYPE,
    label: "Chat bot link",
    category: "Logic",
    create: () => block(CHAT_BOT_LINK_TYPE, { options: {} }),
    Summary: ({ block: b }) => {
      const target = option<string>(b, "chatBotId");
      return target ? <span>{target === "current" ? "Go to a group of this chat bot" : "Go to another chat bot"}</span> : <Muted>Select a chat bot…</Muted>;
    },
    Editor: ChatBotLinkEditor,
  },

  // ---- Inputs (more) ----
  {
    type: "file input",
    label: "File",
    category: "Inputs",
    create: () => block("file input", { options: {} }),
    Summary: ({ block: b }) => (
      <>
        <Muted>{option<boolean>(b, "isMultipleAllowed") ? "Upload files" : "Upload a file"}</Muted> <SavesTo block={b} />
      </>
    ),
    Editor: FileInputEditor,
  },
  {
    type: "payment input",
    label: "Payment",
    category: "Inputs",
    create: () => block("payment input", { options: { provider: "Stripe", currency: "USD" } }),
    Summary: ({ block: b }) => (option<string>(b, "amount") ? <span>{`Pay ${option<string>(b, "amount")} ${option<string>(b, "currency") ?? "USD"}`}</span> : <Muted>Configure payment…</Muted>),
    Editor: PaymentInputEditor,
  },
  {
    type: "cards",
    label: "Cards",
    category: "Inputs",
    create: () => block("cards", { items: [newCard()], options: {} }),
    Summary: () => <Muted>Cards</Muted>,
    Editor: CardsEditor,
    ItemLabel: ({ item }) => <strong>{(item.title as string) || "Card"}</strong>,
    hasItemPaths: true,
  },

  // ---- Integrations ----
  { type: "Webhook", label: "HTTP request", category: "Integrations", create: () => block("Webhook", { options: { webhook: { method: "POST" } } }), Summary: WebhookSummary, Editor: HttpRequestEditor },
  {
    type: "Email",
    label: "Send email",
    category: "Integrations",
    create: () => block("Email", { options: { credentialsId: "default" } }),
    Summary: ({ block: b }) => {
      const recipients = option<string[]>(b, "recipients")?.filter(Boolean) ?? [];
      return recipients.length ? <span className="block-node__ellipsis">{`To: ${recipients.join(", ")}`}</span> : <Muted>Configure email…</Muted>;
    },
    Editor: EmailEditor,
  },
  {
    type: "Google Sheets",
    label: "Google Sheets",
    category: "Integrations",
    create: () => block("Google Sheets", { options: {} }),
    Summary: ({ block: b }) => (option<string>(b, "action") ? <span>{option<string>(b, "action")}</span> : <Muted>Configure…</Muted>),
    Editor: GoogleSheetsEditor,
  },
  {
    type: "gmail",
    label: "Gmail",
    category: "Integrations",
    create: () => block("gmail", { options: { action: "Send email" } }),
    Summary: ({ block: b }) => (option<string>(b, "to") ? <span className="block-node__ellipsis">{`To: ${option<string>(b, "to")}`}</span> : <Muted>Configure Gmail…</Muted>),
    Editor: GmailEditor,
  },
  { type: "Zapier", label: "Zapier", category: "Integrations", create: () => block("Zapier", { options: { webhook: { method: "POST" } } }), Summary: WebhookSummary, Editor: HttpRequestEditor },
  { type: "Make.com", label: "Make.com", category: "Integrations", create: () => block("Make.com", { options: { webhook: { method: "POST" } } }), Summary: WebhookSummary, Editor: HttpRequestEditor },
  { type: "Pabbly", label: "Pabbly", category: "Integrations", create: () => block("Pabbly", { options: { webhook: { method: "POST" } } }), Summary: WebhookSummary, Editor: HttpRequestEditor },
  {
    type: "Google Analytics",
    label: "Google Analytics",
    category: "Integrations",
    create: () => block("Google Analytics", { options: {} }),
    Summary: ({ block: b }) => (option<string>(b, "action") ? <span>{option<string>(b, "action")}</span> : <Muted>Configure tracking…</Muted>),
    Editor: GoogleAnalyticsEditor,
  },
  {
    type: "Pixel",
    label: "Meta Pixel",
    category: "Integrations",
    create: () => block("Pixel", { options: {} }),
    Summary: ({ block: b }) => (option<string>(b, "pixelId") ? <span>{option<string>(b, "eventType") ?? "Init pixel"}</span> : <Muted>Configure pixel…</Muted>),
    Editor: PixelEditor,
  },
  {
    type: "Chatwoot",
    label: "Chatwoot",
    category: "Integrations",
    create: () => block("Chatwoot", { options: { task: "Show widget", baseUrl: "https://app.chatwoot.com" } }),
    Summary: ({ block: b }) => <span>{option<string>(b, "task") ?? "Show widget"}</span>,
    Editor: ChatwootEditor,
  },
];

/** Events start their own path: after every reply, after an invalid reply, or on a command. */
export type EventDefinition = { type: string; label: string; create: () => Omit<ChatBotEvent, "graphCoordinates"> };

export const eventDefinitions: EventDefinition[] = [
  { type: "reply", label: "Reply", create: () => ({ id: createId(), type: "reply", options: {} }) },
  { type: "invalidReply", label: "Invalid reply", create: () => ({ id: createId(), type: "invalidReply", options: {} }) },
  { type: "command", label: "Command", create: () => ({ id: createId(), type: "command", options: {} }) },
];

export const EVENT_LABELS: Record<string, string> = { start: "Start", reply: "Reply", invalidReply: "Invalid reply", command: "Command" };

const definitionsByType = new Map(blockDefinitions.map((definition) => [definition.type, definition]));

/** Definition for any block type — unknown types get a read-only summary and the JSON editor. */
export const getBlockDefinition = (type: string): BlockDefinition => {
  let definition = definitionsByType.get(type);
  if (!definition) {
    // Cached so the same component types are reused across renders.
    definition = {
      type,
      label: type,
      category: "Logic",
      create: () => block(type),
      Summary: () => <Muted>{type}</Muted>,
      Editor: JsonBlockEditor,
      ItemLabel: ({ item }) => <Muted>{item.id}</Muted>,
    };
    definitionsByType.set(type, definition);
  }
  return definition;
};

const knownTypes = new Set(blockDefinitions.map((definition) => definition.type));

export const categoryOf = (type: string): BlockCategory | "Other" =>
  knownTypes.has(type) ? definitionsByType.get(type)!.category : "Other";
