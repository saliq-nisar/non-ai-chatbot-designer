import type { ChatBotSettings, ChatBubble, RichTextNode } from "../../../api/types";

/** Resolves after `ms`, or rejects with an AbortError when the session is disposed. */
export const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

type TypingEmulation = NonNullable<ChatBotSettings["typingEmulation"]>;

// Same defaults and formula as the existing chat widget.
const DEFAULT_TYPING = {
  enabled: true,
  speed: 400,
  maxDelay: 3,
  delayBetweenBubbles: 0,
  isDisabledOnFirstMessage: true,
};

export const resolveTyping = (settings: TypingEmulation | undefined) => ({ ...DEFAULT_TYPING, ...settings });

/** How long the "typing…" indicator shows before a text bubble appears. */
export const typingDelayMs = (bubble: ChatBubble, typing: ReturnType<typeof resolveTyping>, isFirstMessage: boolean) => {
  if (!typing.enabled || bubble.type !== "text") return 0;
  if (isFirstMessage && typing.isDisabledOnFirstMessage) return 0;
  const text = bubble.content.type === "markdown" ? bubble.content.markdown : richTextToPlainText(bubble.content.richText);
  const wordCount = text.match(/(\w+)/g)?.length || text.length;
  return Math.min((wordCount / typing.speed) * 60_000, typing.maxDelay * 1000);
};

export const richTextToPlainText = (nodes: RichTextNode[] | undefined): string =>
  (nodes ?? []).map((node) => node.text ?? richTextToPlainText(node.children)).join(" ");
