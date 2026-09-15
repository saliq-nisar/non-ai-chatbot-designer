import { memo } from "react";
import type { ChatBotSummary } from "../../../api/types";
import { navigate, routes } from "../../../router";

type Props = {
  chatBot: ChatBotSummary;
  onDelete: (chatBot: ChatBotSummary) => void;
};

export const ChatBotCard = memo(({ chatBot, onDelete }: Props) => (
  <article className="card bot-card">
    <h2 className="bot-card__name" title={chatBot.name}>
      {chatBot.icon && !chatBot.icon.startsWith("http") ? `${chatBot.icon} ` : ""}
      {chatBot.name}
    </h2>
    <div className="bot-card__footer">
      {chatBot.publishedChatBotId ? (
        <span className="badge badge--published">Published</span>
      ) : (
        <span className="badge badge--draft">Draft</span>
      )}
      <div className="page__actions">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onDelete(chatBot)}>
          Delete
        </button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate(routes.builder(chatBot.id))}>
          Open
        </button>
      </div>
    </div>
  </article>
));
