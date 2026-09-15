import { useEffect, useState, useSyncExternalStore } from "react";
import type { ChatContext } from "../../../api/chatApi";
import { type ChatSession, type ChatState, createChatSession } from "./chatSession";

/** Creates one session for the component's lifetime; disposes it on unmount. */
export const useChatSession = (publicId: string, context: ChatContext) => {
  const [session] = useState(() => createChatSession({ publicId, context }));
  useEffect(() => {
    session.start();
    return () => session.dispose();
  }, [session]);
  return session;
};

/**
 * Subscribes to one slice of the chat state. The selector must return an existing
 * state field (or a primitive) so unrelated updates don't cause a re-render.
 */
export const useChatState = <T>(session: ChatSession, selector: (state: ChatState) => T): T =>
  useSyncExternalStore(session.subscribe, () => selector(session.getState()));
