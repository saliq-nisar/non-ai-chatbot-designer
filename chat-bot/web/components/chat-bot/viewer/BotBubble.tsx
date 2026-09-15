import type { ChatBubble } from "../../../api/types";
import { RichText } from "./RichText";

const isHttpUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

const videoEmbedUrl = (content: Extract<ChatBubble, { type: "video" }>["content"]) => {
  if (!content.id) return undefined;
  if (content.type === "youtube") return `https://www.youtube.com/embed/${encodeURIComponent(content.id)}`;
  if (content.type === "vimeo") return `https://player.vimeo.com/video/${encodeURIComponent(content.id)}`;
  return undefined;
};

/** One message from the bot. Add a case here to support/customize a bubble type. */
export const BotBubble = ({ bubble }: { bubble: ChatBubble }) => {
  switch (bubble.type) {
    case "text":
      return (
        <div className="chat__bubble chat__bubble--host chat__text">
          {bubble.content.type === "richText" ? (
            <RichText nodes={bubble.content.richText ?? []} />
          ) : (
            <p>{bubble.content.markdown}</p>
          )}
        </div>
      );

    case "image": {
      const { url, clickLink } = bubble.content;
      if (!url || !/^(https?:\/\/|data:image\/)/i.test(url)) return null;
      const image = <img className="chat__media" src={url} alt={clickLink?.alt ?? ""} loading="lazy" />;
      return (
        <div className="chat__bubble chat__bubble--host chat__bubble--media">
          {isHttpUrl(clickLink?.url) ? (
            <a href={clickLink.url} target="_blank" rel="noopener noreferrer">
              {image}
            </a>
          ) : (
            image
          )}
        </div>
      );
    }

    case "video": {
      const embedUrl = videoEmbedUrl(bubble.content);
      const aspectRatio = bubble.content.aspectRatio ?? "16/9";
      return (
        <div className="chat__bubble chat__bubble--host chat__bubble--media">
          {embedUrl ? (
            <iframe className="chat__media" style={{ aspectRatio }} src={embedUrl} title="Video" allowFullScreen />
          ) : isHttpUrl(bubble.content.url) ? (
            <video className="chat__media" src={bubble.content.url} controls style={{ aspectRatio }} />
          ) : null}
        </div>
      );
    }

    case "audio":
      return isHttpUrl(bubble.content.url) ? (
        <div className="chat__bubble chat__bubble--host">
          <audio src={bubble.content.url} controls autoPlay={bubble.content.isAutoplayEnabled} />
        </div>
      ) : null;

    case "embed":
      return isHttpUrl(bubble.content.url) ? (
        <div className="chat__bubble chat__bubble--host chat__bubble--media chat__bubble--embed">
          <iframe
            className="chat__media"
            src={bubble.content.url}
            title="Embedded content"
            style={{ height: Number(bubble.content.height) || 400 }}
          />
        </div>
      ) : null;

    default:
      return null;
  }
};
