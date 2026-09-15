import { useCallback, useEffect, useState } from "react";
import { chatBotApi } from "../api/chatBotApi";
import { errorMessage } from "../api/http";
import type { ChatBotSummary } from "../api/types";
import { appConfig } from "../config";
import { ChatBotCard } from "../components/chat-bot/list/ChatBotCard";
import { CreateChatBotDialog } from "../components/chat-bot/list/CreateChatBotDialog";
import { ImportChatBotDialog } from "../components/chat-bot/list/ImportChatBotDialog";
import { ConfirmDialog } from "../components/chat-bot/shared/ConfirmDialog";
import { Spinner } from "../components/chat-bot/shared/Spinner";
import "./pages.css";

type OpenDialog = { kind: "create" } | { kind: "import" } | { kind: "delete"; chatBot: ChatBotSummary };

const ChatBotListPage = () => {
  const [chatBots, setChatBots] = useState<ChatBotSummary[]>();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<OpenDialog>();

  useEffect(() => {
    let isCurrent = true;
    chatBotApi
      .listChatBots(appConfig.workspaceId)
      .then((list) => isCurrent && setChatBots(list))
      .catch((err) => isCurrent && setError(errorMessage(err)));
    return () => {
      isCurrent = false;
    };
  }, []);

  // Stable so memoized cards don't re-render when a dialog opens.
  const askDelete = useCallback((chatBot: ChatBotSummary) => setDialog({ kind: "delete", chatBot }), []);

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">Chat Bots</h1>
        <div className="page__actions">
          <button type="button" className="btn" onClick={() => setDialog({ kind: "import" })}>
            Import
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: "create" })}>
            Create chat bot
          </button>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="alert">{error}</p>}
      {!chatBots && !error && (
        <div className="center" style={{ height: 200 }}>
          <Spinner />
        </div>
      )}
      {chatBots?.length === 0 && <p className="empty">No chat bots yet. Create or import one to get started.</p>}
      {chatBots && chatBots.length > 0 && (
        <div className="bot-grid">
          {chatBots.map((chatBot) => (
            <ChatBotCard key={chatBot.id} chatBot={chatBot} onDelete={askDelete} />
          ))}
        </div>
      )}

      {dialog?.kind === "create" && <CreateChatBotDialog onClose={() => setDialog(undefined)} />}
      {dialog?.kind === "import" && <ImportChatBotDialog onClose={() => setDialog(undefined)} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete chat bot"
          message={
            <p>
              Delete <strong>{dialog.chatBot.name}</strong>? It will be unpublished and removed. This cannot be undone.
            </p>
          }
          confirmLabel="Delete"
          isDestructive
          onConfirm={async () => {
            await chatBotApi.deleteChatBot(dialog.chatBot.id);
            setChatBots((list) => list?.filter((chatBot) => chatBot.id !== dialog.chatBot.id));
          }}
          onClose={() => setDialog(undefined)}
        />
      )}
    </main>
  );
};

export default ChatBotListPage;
