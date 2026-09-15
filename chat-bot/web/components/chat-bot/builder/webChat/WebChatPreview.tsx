import { useEffect, useMemo, useRef } from "react";
import type { WebChatConfig } from "../../../../../shared/webChat";

type PreviewWindow = Window & { ChatBotWebChat?: { update: (config: WebChatConfig) => void; open: () => void } };

/**
 * Live preview: the real Web Chat script running on a mock website inside an iframe.
 * Every change is pushed with ChatBotWebChat.update(), so the preview matches production.
 * Conversations started here are test conversations (not recorded).
 */
export const WebChatPreview = ({ publicId, config }: { publicId: string; config: WebChatConfig }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // The mock page is built once per public ID; design changes never reload it.
  const srcDoc = useMemo(
    () => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f3f4f6; color: #374151; }
  .bar { height: 48px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  .content { max-width: 560px; margin: 32px auto; padding: 0 20px; }
  .line { height: 12px; margin: 12px 0; border-radius: 6px; background: #e5e7eb; }
  h1 { font-size: 22px; margin: 0 0 16px; color: #111827; }
</style></head>
<body>
  <div class="bar"></div>
  <div class="content"><h1>Your website</h1>
    <div class="line" style="width: 90%"></div><div class="line" style="width: 75%"></div><div class="line" style="width: 82%"></div>
    <div class="line" style="width: 60%"></div><div class="line" style="width: 70%"></div>
  </div>
  <script src="${window.location.origin}/web-chat.js" data-chat-bot-id="${encodeURIComponent(publicId)}" data-preview="true"></script>
</body></html>`,
    [publicId],
  );

  useEffect(() => {
    (iframeRef.current?.contentWindow as PreviewWindow | null)?.ChatBotWebChat?.update(config);
  }, [config]);

  return (
    <iframe
      ref={iframeRef}
      className="webchat-preview"
      title="Web Chat preview"
      srcDoc={srcDoc}
      onLoad={() => (iframeRef.current?.contentWindow as PreviewWindow | null)?.ChatBotWebChat?.update(configRef.current)}
    />
  );
};
