import type { Block, ChatBubble, RichTextNode, Variable } from "../../shared/types.js";
import { deepParseVariables, parseVariablesInRichText } from "./variables.js";

export const BUBBLE_TYPES = new Set(["text", "image", "video", "audio", "embed"]);

const YOUTUBE = /youtube\.com\/(?:watch\?v=|shorts\/)([\w-]+)|youtu\.be\/([\w-]+)/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;

const parseVideoUrl = (url: string) => {
  const youtube = url.match(YOUTUBE);
  if (youtube) return { type: "youtube", id: youtube[1] ?? youtube[2] };
  const vimeo = url.match(VIMEO);
  if (vimeo) return { type: "vimeo", id: vimeo[1] };
  return { type: "url" };
};

/** Turns a bubble block into the message sent to the chat UI, with variables filled in. Returns undefined for empty blocks. */
export const toChatBubble = (block: Block, variables: Variable[]): ChatBubble | undefined => {
  if (!block.content) return undefined;
  switch (block.type) {
    case "text": {
      const richText = parseVariablesInRichText((block.content.richText as RichTextNode[] | undefined) ?? [], variables);
      return { id: block.id, type: "text", content: { type: "richText", richText } };
    }
    case "video": {
      const content = deepParseVariables(block.content, variables) as { url?: string };
      return { id: block.id, type: "video", content: { ...content, ...(content.url ? parseVideoUrl(content.url) : {}) } };
    }
    case "image":
    case "audio":
    case "embed":
      return { id: block.id, type: block.type, content: deepParseVariables(block.content, variables) } as ChatBubble;
    default:
      return undefined;
  }
};

const inlineText = (node: RichTextNode): string => node.text ?? (node.children ?? []).map(inlineText).join("");

/** Plain text of a message: used for the webhook payload and the transcript. */
export const bubbleToText = (bubble: ChatBubble): string => {
  switch (bubble.type) {
    case "text":
      return bubble.content.type === "markdown" ? bubble.content.markdown : bubble.content.richText.map(inlineText).join(" ").trim();
    case "image":
      return "[image]";
    case "video":
      return "[video]";
    case "audio":
      return "[audio]";
    case "embed":
      return "[embed]";
    default:
      return "[message]";
  }
};

const inlineMarkdown = (node: RichTextNode): string => {
  if (node.text !== undefined) {
    let text = node.text;
    if (text.trim() === "") return text;
    if (node.bold) text = `**${text}**`;
    if (node.italic) text = `_${text}_`;
    return text;
  }
  const children = (node.children ?? []).map(inlineMarkdown).join("");
  return node.type === "a" && node.url ? `[${children}](${node.url})` : children;
};

/** For clients that request textBubbleContentFormat "markdown". */
export const toMarkdownBubble = (bubble: ChatBubble): ChatBubble =>
  bubble.type === "text" && bubble.content.type === "richText"
    ? { ...bubble, content: { type: "markdown", markdown: bubble.content.richText.map(inlineMarkdown).join("\n") } }
    : bubble;
