import type { ChatBubble } from "../../../api/types";

/**
 * Live agent messages: connects to the external Socket.IO server with the token from
 * startChat. The server joins the socket to this conversation's room only, and pushes
 * "receiveMessage" events that are shown as bot messages.
 * socket.io-client is loaded only when a conversation actually has a live-agent token.
 */
export const listenForLiveAgentMessages = async ({
  host,
  token,
  signal,
  onMessage,
}: {
  host: string;
  token: string;
  signal: AbortSignal;
  onMessage: (bubble: ChatBubble) => void;
}) => {
  const { io } = await import("socket.io-client");
  if (signal.aborted) return;
  const socket = io(host, { transports: ["websocket"], auth: { token } });
  let count = 0;
  socket.on("receiveMessage", (payload: { message?: string } | undefined) => {
    if (!payload?.message) return;
    onMessage({
      id: `live-agent-${++count}`,
      type: "text",
      content: { type: "richText", richText: [{ type: "p", children: [{ text: payload.message }] }] },
    });
  });
  signal.addEventListener("abort", () => socket.disconnect(), { once: true });
};
