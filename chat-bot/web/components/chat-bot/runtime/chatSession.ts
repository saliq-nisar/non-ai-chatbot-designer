import { type ChatContext, chatApi } from "../../../api/chatApi";
import { errorMessage, isAbortError } from "../../../api/http";
import type { ChatBubble, ChatInput, ChatReply, ClientSideAction } from "../../../api/types";
import { type ChatAppearance, defaultChatAppearance, resolveChatAppearance } from "../../../theme/chatAppearance";
import { executeClientSideAction } from "./clientSideActions";
import { listenForLiveAgentMessages } from "./liveAgent";
import { resolveTyping, sleep, typingDelayMs } from "./timing";

/**
 * Chat session runtime — no React inside. One instance per conversation.
 *
 *   start()  -> startChat     -> show bubbles -> wait for input
 *   answer() -> continueChat  -> show bubbles -> wait for input … until no input is returned.
 *
 * State is replaced immutably and only the changed fields get new references,
 * so React components subscribed to one field don't re-render for the others.
 */

export type ChatEntry = { id: string; kind: "bot"; bubble: ChatBubble } | { id: string; kind: "user"; text: string };

export type ChatStatus = "starting" | "botTyping" | "waitingForInput" | "sending" | "ended" | "error";

export type ChatState = {
  status: ChatStatus;
  entries: ChatEntry[];
  input?: ChatInput;
  error?: string;
  appearance: ChatAppearance;
  progress?: number;
  /**
   * Free-text mode for talking to a live agent: on when the flow ended or an agent message
   * arrived. The bot's own input is then hidden; messages go to the live agent.
   */
  isLiveAgentMode: boolean;
};

/** What the visitor answered. `label` is displayed, `value` is sent (e.g. button label vs. value). */
export type ChatAnswer = { value: string; label?: string };

export type ChatSession = ReturnType<typeof createChatSession>;

export const createChatSession = ({ publicId, context }: { publicId: string; context: ChatContext }) => {
  let state: ChatState = { status: "starting", entries: [], appearance: defaultChatAppearance, isLiveAgentMode: false };
  const listeners = new Set<() => void>();
  const abortController = new AbortController();
  const { signal } = abortController;

  let hasStarted = false;
  let sessionId: string | undefined;
  let typing = resolveTyping(undefined);
  let hasShownFirstMessage = false;
  let entryCount = 0;
  let resumeAfterError: (() => void) | undefined;

  const setState = (patch: Partial<ChatState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const nextEntryId = () => `entry-${++entryCount}`;

  /** Calls the API; on failure shows the error and waits for retry() to call it again. */
  const callApi = async <T>(call: () => Promise<T>): Promise<T> => {
    for (;;) {
      try {
        return await call();
      } catch (error) {
        if (signal.aborted || isAbortError(error)) throw error;
        const statusBeforeError = state.status;
        setState({ status: "error", error: errorMessage(error) });
        await new Promise<void>((resolve, reject) => {
          resumeAfterError = resolve;
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        setState({ status: statusBeforeError, error: undefined });
      }
    }
  };

  const showBubble = async (bubble: ChatBubble, index: number) => {
    const delay = typingDelayMs(bubble, typing, !hasShownFirstMessage);
    if (index > 0 && typing.delayBetweenBubbles > 0) await sleep(typing.delayBetweenBubbles * 1000, signal);
    if (delay > 0) {
      setState({ status: "botTyping" });
      await sleep(delay, signal);
    }
    hasShownFirstMessage = true;
    setState({ entries: [...state.entries, { id: nextEntryId(), kind: "bot", bubble }] });
  };

  /** Runs an action. Returns true when it continued the conversation itself. */
  const runAction = async (action: ClientSideAction) => {
    try {
      await executeClientSideAction(action, { signal, context });
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn("[chat] client-side action failed:", action.type, error);
    }
    if (!action.expectsDedicatedReply) return false;
    const reply = await callApi(() => chatApi.continueChat(sessionId!, undefined, context, { signal }));
    await processReply(reply);
    return true;
  };

  const processReply = async (reply: ChatReply): Promise<void> => {
    const actions = reply.clientSideActions ?? [];
    const bubbleIds = new Set(reply.messages.map((bubble) => bubble.id));

    // Actions not attached to a displayed bubble run before the bubbles.
    for (const action of actions) {
      if (action.lastBubbleBlockId && bubbleIds.has(action.lastBubbleBlockId)) continue;
      if (await runAction(action)) return;
    }
    for (const [index, bubble] of reply.messages.entries()) {
      await showBubble(bubble, index);
      for (const action of actions) {
        if (action.lastBubbleBlockId !== bubble.id) continue;
        if (await runAction(action)) return;
      }
    }

    setState({
      input: reply.input,
      status: reply.input ? "waitingForInput" : "ended",
      // The flow ended: the visitor can keep writing to a live agent.
      isLiveAgentMode: state.isLiveAgentMode || !reply.input,
      ...(reply.progress !== undefined ? { progress: reply.progress } : {}),
    });
  };

  const handleFailure = (error: unknown) => {
    if (signal.aborted || isAbortError(error)) return;
    setState({ status: "error", error: errorMessage(error) });
  };

  return {
    getState: () => state,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start: () => {
      if (hasStarted) return;
      hasStarted = true;
      (async () => {
        const reply = await callApi(() => chatApi.startChat(publicId, context, { signal }));
        sessionId = reply.sessionId;
        if (reply.widgetSocketToken && reply.liveAgentSocketHost)
          listenForLiveAgentMessages({
            host: reply.liveAgentSocketHost,
            token: reply.widgetSocketToken,
            signal,
            // An agent took over: show the message and switch to free-text mode.
            onMessage: (bubble) => setState({ entries: [...state.entries, { id: nextEntryId(), kind: "bot", bubble }], isLiveAgentMode: true }),
          }).catch((error) => console.warn("[chat] live agent connection failed:", error));
        typing = resolveTyping(reply.chatBot.settings.typingEmulation);
        setState({ appearance: resolveChatAppearance(reply.chatBot.theme) });
        await processReply(reply);
      })().catch(handleFailure);
    },

    answer: ({ value, label }: ChatAnswer) => {
      if (state.status !== "waitingForInput" || !sessionId) return;
      const userEntry: ChatEntry = { id: nextEntryId(), kind: "user", text: label ?? value };
      setState({ entries: [...state.entries, userEntry], input: undefined, status: "sending" });

      (async () => {
        const reply = await callApi(() => chatApi.continueChat(sessionId!, { type: "text", text: value }, context, { signal }));
        // The backend may normalize the answer (e.g. a date); show what it stored.
        if (reply.lastMessageNewFormat && reply.lastMessageNewFormat !== userEntry.text) {
          setState({
            entries: state.entries.map((entry) =>
              entry.id === userEntry.id ? { ...entry, text: reply.lastMessageNewFormat! } : entry,
            ),
          });
        }
        await processReply(reply);
      })().catch(handleFailure);
    },

    /** Free-text message to the live agent. Shown immediately; a delivery error is shown without blocking. */
    sendLiveAgentMessage: (text: string) => {
      const message = text.trim();
      if (!message || !sessionId) return;
      setState({ entries: [...state.entries, { id: nextEntryId(), kind: "user", text: message }], error: undefined });
      chatApi.sendLiveAgentMessage(sessionId, message, context).catch((error) => {
        if (!signal.aborted) setState({ error: errorMessage(error) });
      });
    },

    /** Uploads files for the current file input; resolves to the answer (their URLs). */
    uploadFiles: async (files: File[]) => {
      if (!sessionId) throw new Error("The conversation has not started");
      const urls = await Promise.all(files.map((file) => chatApi.uploadFile(sessionId!, file, { signal })));
      return urls.join(", ");
    },

    /** Skips an optional input (a file input that isn't required). */
    skip: (label: string) => {
      if (state.status !== "waitingForInput" || !sessionId) return;
      setState({ entries: [...state.entries, { id: nextEntryId(), kind: "user", text: label }], input: undefined, status: "sending" });
      (async () => {
        const reply = await callApi(() => chatApi.continueChat(sessionId!, undefined, context, { signal }));
        await processReply(reply);
      })().catch(handleFailure);
    },

    /** Retries the request that failed. */
    retry: () => {
      const resume = resumeAfterError;
      resumeAfterError = undefined;
      resume?.();
    },

    /** Cancels pending requests and timers. Call when the chat unmounts. */
    dispose: () => {
      abortController.abort();
      listeners.clear();
    },
  };
};
