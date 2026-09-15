import { useEffect, useState } from "react";
import { chatBotApi } from "../api/chatBotApi";
import { errorMessage } from "../api/http";
import type { ChatBot, PublishedChatBot } from "../api/types";
import { ChatBotBuilder } from "../components/chat-bot/builder/ChatBotBuilder";
import { Spinner } from "../components/chat-bot/shared/Spinner";
import { navigate, routes } from "../router";

type Loaded = { chatBot: ChatBot; published: PublishedChatBot | null };

const SUPPORTED_VERSIONS = new Set(["6", "6.1"]);

/** Loads the chat bot and its published state (two requests in parallel), then opens the builder. */
const ChatBotBuilderPage = ({ chatBotId }: { chatBotId: string }) => {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;
    Promise.all([chatBotApi.getChatBot(chatBotId), chatBotApi.getPublishedChatBot(chatBotId)])
      .then(([chatBot, published]) => isCurrent && setLoaded({ chatBot, published }))
      .catch((err) => isCurrent && setError(errorMessage(err)));
    return () => {
      isCurrent = false;
    };
  }, [chatBotId]);

  if (error)
    return (
      <div className="center">
        <div>
          <p className="alert">{error}</p>
          <button type="button" className="btn" onClick={() => navigate(routes.list())}>
            Back to chat bots
          </button>
        </div>
      </div>
    );

  if (!loaded)
    return (
      <div className="center">
        <Spinner />
      </div>
    );

  if (!SUPPORTED_VERSIONS.has(loaded.chatBot.version))
    return (
      <div className="center">
        <div className="alert" style={{ maxWidth: 480 }}>
          This chat bot uses an older format (version {loaded.chatBot.version}). Export it and import it again to convert it to
          the current format.
        </div>
      </div>
    );

  return <ChatBotBuilder chatBot={loaded.chatBot} published={loaded.published} />;
};

export default ChatBotBuilderPage;
