import { useEffect, useState } from "react";
import type { WebChatConfig } from "../../shared/webChat";
import { ChatViewer } from "../components/chat-bot/viewer/ChatViewer";

/**
 * Public chat page: /chat/:publicId
 * Also the content of the Web Chat window (?embed=1). The Web Chat script sends the header
 * design (title, subtitle, avatar, colors) with postMessage, and the close button asks it to
 * close the window. ?preview=1 is the builder's Web Chat designer (a test conversation); with
 * &chatBotId=… it runs the saved chat bot even when it isn't published (signed-in users only).
 */
const ChatPage = ({ publicId }: { publicId: string }) => {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded = params.get("embed") === "1" && window.parent !== window;
  const isPreview = params.get("preview") === "1";
  const previewChatBotId = isPreview ? params.get("chatBotId") : null;
  const [header, setHeader] = useState<WebChatConfig["header"]>();

  // The website the Web Chat is placed on (checked against the chat bot's allowed origins).
  const referrerOrigin = isEmbedded && document.referrer ? new URL(document.referrer).origin : undefined;
  const embedOrigin = referrerOrigin && referrerOrigin !== "null" ? referrerOrigin : undefined;

  useEffect(() => {
    if (!isEmbedded) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; header?: WebChatConfig["header"] } | null;
      if (data?.type === "chat-bot:header" && data.header) setHeader(data.header);
    };
    window.addEventListener("message", onMessage);
    // Ask the Web Chat script for the header in case its first message came before we listened.
    window.parent.postMessage({ type: "chat-bot:ready", publicId }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [isEmbedded, publicId]);

  return (
    <div style={{ height: "100dvh" }}>
      <ChatViewer
        publicId={publicId}
        context={previewChatBotId ? { mode: "preview", chatBotId: previewChatBotId, getDraft: () => undefined } : { mode: isPreview ? "test" : "live", embedOrigin }}
        header={isEmbedded ? (header?.isEnabled === false ? undefined : header ?? { title: "" }) : undefined}
        onClose={isEmbedded ? () => window.parent.postMessage({ type: "chat-bot:close", publicId }, "*") : undefined}
      />
    </div>
  );
};

export default ChatPage;
