import type { Block, ChatBotSettings, Item, Variable } from "../../shared/types.js";
import { type Condition, executeCondition } from "./conditions.js";
import type { ChatInput, VariableUpdate } from "./types.js";
import { deepParseVariables, findVariable, parseVariables, valueToText } from "./variables.js";

/** Input blocks: what is sent to the chat UI, and how the visitor's reply is validated. */

export const INPUT_TYPES = new Set([
  "text input",
  "number input",
  "email input",
  "url input",
  "date input",
  "time input",
  "phone number input",
  "choice input",
  "picture choice input",
  "payment input",
  "rating input",
  "file input",
  "cards",
]);

export type ParsedReply =
  | { status: "success"; content: string; outgoingEdgeId?: string; variables?: VariableUpdate[] }
  | { status: "skip" }
  | { status: "fail" };

const DEFAULT_RETRY_MESSAGES: Record<string, string> = {
  "email input": "This email doesn't seem to be valid. Can you type it again?",
  "url input": "This URL doesn't seem to be valid. Can you type it again?",
  "phone number input": "This phone number doesn't seem to be valid. Can you type it again?",
  "payment input": "Payment failed. Please, try again.",
};
const DEFAULT_INVALID_MESSAGE = "Invalid message. Please, try again.";

const option = <T>(block: Block, key: string) => block.options?.[key] as T | undefined;

// ---- formatting the input sent to the client --------------------------------------

const visibleItems = (block: Block, variables: Variable[]): Item[] => {
  const dynamicVariable = findVariable(variables, option<string>(block, "dynamicVariableId"));
  if (block.type === "choice input" && dynamicVariable?.value !== null && dynamicVariable?.value !== undefined) {
    const values = Array.isArray(dynamicVariable.value) ? dynamicVariable.value : [dynamicVariable.value];
    return [...new Set(values.filter((value): value is string => !!value))].map((content, index) => ({ id: `choice${index}`, content }));
  }
  return (block.items ?? []).filter((item) => {
    // Cards keep their display condition inside `options`.
    const display = (item.displayCondition ?? (item.options as { displayCondition?: unknown } | undefined)?.displayCondition) as
      | { isEnabled?: boolean; condition?: Condition }
      | undefined;
    return !display?.isEnabled || executeCondition(display.condition, variables);
  });
};

export const formatInput = (block: Block, { variables, settings }: { variables: Variable[]; settings: ChatBotSettings }): ChatInput => {
  const parsed = deepParseVariables({ ...block, ...(block.items ? { items: visibleItems(block, variables) } : {}) }, variables);
  const isPrefillEnabled = settings.general?.isInputPrefillEnabled === true;
  const savedValue = findVariable(variables, option<string>(block, "variableId"))?.value;
  return isPrefillEnabled && savedValue ? { ...parsed, prefilledValue: valueToText(savedValue) } : parsed;
};

export const retryMessage = (block: Block, { variables, settings }: { variables: Variable[]; settings: ChatBotSettings }) => {
  const custom = option<string>(block, "retryMessageContent");
  if (custom) return parseVariables(custom, variables);
  const systemInvalid = (settings.general?.systemMessages as { invalidMessage?: string } | undefined)?.invalidMessage;
  return DEFAULT_RETRY_MESSAGES[block.type] ?? (systemInvalid ? parseVariables(systemInvalid, variables) : DEFAULT_INVALID_MESSAGE);
};

// ---- validating replies ----------------------------------------------------------------

const EMAIL_PATTERN =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const isUrl = (text: string) => {
  if (/\s/.test(text)) return false;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") && !url.hostname.startsWith(".") && !url.hostname.endsWith(".");
  } catch {
    return false;
  }
};

const itemLabel = (item: Item, block: Block) => ((block.type === "picture choice input" ? item.title : item.content) as string | undefined) ?? "";

/** Choice matching: by reply id, item id, saved value or label (longest labels first). */
const parseSingleChoice = (reply: string, items: Item[], block: Block, replyId?: string): ParsedReply => {
  const sorted = [...items].sort((a, b) => itemLabel(b, block).length - itemLabel(a, block).length);
  const matched = sorted.find(
    (item) =>
      (replyId && item.id === replyId) ||
      item.id === reply ||
      (typeof item.value === "string" && item.value.trim() !== "" && reply.trim() === item.value.trim()) ||
      (itemLabel(item, block) !== "" && reply.trim() === itemLabel(item, block).trim()),
  );
  if (!matched) return { status: "fail" };
  const content = (matched.value as string | undefined) || itemLabel(matched, block);
  return content ? { status: "success", content, outgoingEdgeId: matched.outgoingEdgeId } : { status: "fail" };
};

const includesWholePhrase = (text: string, phrase: string) => {
  const words = phrase.trim().split(/\s+/u).filter(Boolean);
  if (!words.length || !text) return false;
  const inner = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const boundary = "[^\\p{L}\\p{N}\\p{M}]";
  return new RegExp(`(?:^|${boundary})${inner}(?=$|${boundary})`, "ui").test(text);
};

const parseMultipleChoice = (reply: string, items: Item[], block: Block): ParsedReply => {
  let remaining = reply;
  const matchedIds = new Set<string>();
  const sorted = [...items].sort((a, b) => itemLabel(b, block).length - itemLabel(a, block).length);
  const consume = (item: Item, phrase: string | undefined) => {
    if (!phrase || matchedIds.has(item.id) || !includesWholePhrase(remaining, phrase)) return;
    remaining = remaining.replace(phrase, "").trim();
    matchedIds.add(item.id);
  };
  for (const item of sorted) consume(item, item.id);
  for (const item of sorted) consume(item, item.value as string | undefined);
  for (const item of sorted) consume(item, itemLabel(item, block));
  items.forEach((item, index) => consume(item, `${index + 1}`));
  if (matchedIds.size === 0) return { status: "fail" };
  return {
    status: "success",
    content: items
      .filter((item) => matchedIds.has(item.id))
      .map((item) => (item.value as string | undefined) ?? itemLabel(item, block).trim())
      .join(", "),
  };
};

/** Formats a Date with the tokens used by date/time inputs (yyyy yy MM M dd d HH H hh h mm ss a). */
export const formatDate = (date: Date, pattern: string) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours12 = date.getUTCHours() % 12 || 12;
  const tokens: Record<string, string> = {
    yyyy: String(date.getUTCFullYear()),
    yy: String(date.getUTCFullYear()).slice(-2),
    MM: pad(date.getUTCMonth() + 1),
    M: String(date.getUTCMonth() + 1),
    dd: pad(date.getUTCDate()),
    d: String(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    H: String(date.getUTCHours()),
    hh: pad(hours12),
    h: String(hours12),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
    a: date.getUTCHours() < 12 ? "AM" : "PM",
  };
  return pattern.replace(/yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|ss|a/g, (token) => tokens[token]!);
};

/** Accepts ISO (2026-09-14, 2026-09-14T10:30) or day-first (14/09/2026 10:30) dates. Times are kept as typed (no time zone shift). */
const parseDate = (text: string): Date | undefined => {
  const trimmed = text.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  const dayFirst = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  const parts = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5]] : dayFirst ? [dayFirst[3], dayFirst[2], dayFirst[1], dayFirst[4], dayFirst[5]] : undefined;
  if (!parts) return undefined;
  const [year, month, day, hours, minutes] = parts.map((part) => Number(part ?? 0));
  const date = new Date(Date.UTC(year!, month! - 1, day!, hours, minutes));
  return date.getUTCMonth() === month! - 1 ? date : undefined;
};

const parseDateReply = (reply: string, block: Block): ParsedReply => {
  const isRange = option<boolean>(block, "isRange") === true;
  const format = option<string>(block, "format") || (option<boolean>(block, "hasTime") ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy");
  const [startText, endText] = reply.split(/\s+to\s+/i);
  const start = parseDate(startText ?? "");
  const end = endText ? parseDate(endText) : undefined;
  if (!start || (isRange && !end)) return { status: "fail" };
  const min = option<string>(block, "min");
  const max = option<string>(block, "max");
  for (const date of [start, end]) {
    if (!date) continue;
    if (max && date > new Date(max)) return { status: "fail" };
    if (min && date < new Date(min)) return { status: "fail" };
  }
  return { status: "success", content: isRange ? `${formatDate(start, format)} to ${formatDate(end!, format)}` : formatDate(start, format) };
};

const parseTimeReply = (reply: string, block: Block): ParsedReply => {
  const match = reply.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return { status: "fail" };
  let hours = Number(match[1]);
  if (match[3]) hours = (hours % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  if (hours > 23 || Number(match[2]) > 59) return { status: "fail" };
  return { status: "success", content: formatDate(new Date(Date.UTC(2000, 0, 1, hours, Number(match[2]))), option<string>(block, "format") || "HH:mm") };
};

const parseNumberReply = (reply: string, block: Block, variables: Variable[]): ParsedReply => {
  const value = Number.parseFloat(reply);
  if (reply.trim() === "" || Number.isNaN(value)) return { status: "fail" };
  const min = Number.parseFloat(parseVariables(option<string | number>(block, "min")?.toString(), variables));
  const max = Number.parseFloat(parseVariables(option<string | number>(block, "max")?.toString(), variables));
  if ((!Number.isNaN(min) && value < min) || (!Number.isNaN(max) && value > max)) return { status: "fail" };
  return { status: "success", content: reply.startsWith("0") ? reply : String(value) };
};

/** Phone numbers: digits (optionally starting with +), 6–15 digits after removing spaces, dashes, dots and parentheses. */
const parsePhoneReply = (reply: string): ParsedReply => {
  const normalized = reply.replace(/[\s().-]/g, "");
  return /^\+?\d{6,15}$/.test(normalized) ? { status: "success", content: normalized } : { status: "fail" };
};

type CardItem = Item & { title?: string | null; imageUrl?: string | null; description?: string | null; options?: { internalValue?: string | null }; paths?: { id: string; text?: string; outgoingEdgeId?: string }[] };

/** Cards: the visitor clicks one button ("path") of one card. */
const parseCardsReply = (reply: string, block: Block, variables: Variable[], replyId?: string): ParsedReply => {
  const items = deepParseVariables(visibleItems(block, variables), variables) as CardItem[];
  let path: NonNullable<CardItem["paths"]>[number] | undefined;
  const item = [...items]
    .sort((a, b) => (b.title?.length ?? 0) - (a.title?.length ?? 0))
    .find((card) => {
      path = card.paths?.find((p) => p.id === reply || (replyId && p.id === replyId));
      return !!path || card.title?.toLowerCase().trim() === reply.toLowerCase().trim();
    });
  if (!item) return { status: "fail" };
  path ??= item.paths?.[0];
  const content = item.title || item.imageUrl;
  if (!content) return { status: "fail" };
  const fieldValue: Record<string, string | null | undefined> = {
    "Image URL": item.imageUrl,
    Title: item.title,
    Description: item.description,
    Button: path?.text,
    "Internal Value": item.options?.internalValue,
  };
  const mappings = (block.options?.saveResponseMapping ?? []) as { field?: string; variableId?: string }[];
  const updates = mappings
    .filter((mapping) => mapping.field && mapping.variableId && variables.some((v) => v.id === mapping.variableId))
    .map((mapping) => ({ id: mapping.variableId!, value: fieldValue[mapping.field!] ?? null }));
  return { status: "success", content, outgoingEdgeId: path?.outgoingEdgeId, variables: updates };
};

export const validateReply = (block: Block, reply: string, { variables, replyId }: { variables: Variable[]; replyId?: string }): ParsedReply => {
  switch (block.type) {
    case "file input": {
      const urls = reply.split(", ").map((url) => url.trim()).filter(Boolean);
      if (urls.length === 0 || !urls.every((url) => /^https?:\/\//.test(url))) return { status: "fail" };
      return { status: "success", content: option<boolean>(block, "isMultipleAllowed") ? urls.join(", ") : urls[0]! };
    }
    case "payment input":
      return reply === "fail" || reply === "" ? { status: "fail" } : { status: "success", content: reply };
    case "cards":
      return parseCardsReply(reply, block, variables, replyId);
    case "email input":
      return EMAIL_PATTERN.test(reply.trim()) ? { status: "success", content: reply.trim().toLowerCase() } : { status: "fail" };
    case "url input":
      return isUrl(reply.trim()) ? { status: "success", content: reply.trim() } : { status: "fail" };
    case "phone number input":
      return parsePhoneReply(reply);
    case "number input":
      return parseNumberReply(reply, block, variables);
    case "date input":
      return parseDateReply(reply, block);
    case "time input":
      return parseTimeReply(reply, block);
    case "rating input": {
      const rating = Number(reply);
      return Number.isFinite(rating) && rating <= (option<number>(block, "length") || 10) ? { status: "success", content: reply } : { status: "fail" };
    }
    case "choice input":
    case "picture choice input": {
      const items = deepParseVariables(visibleItems(block, variables), variables);
      return option<boolean>(block, "isMultipleChoice") ? parseMultipleChoice(reply, items, block) : parseSingleChoice(reply, items, block, replyId);
    }
    default:
      return reply === "" ? { status: "fail" } : { status: "success", content: reply };
  }
};
