import { useMemo } from "react";
import type { ChatContext } from "../../../api/chatApi";
import { toCssVariables } from "../../../theme/chatAppearance";
import { useChatSession, useChatState } from "../runtime/useChatSession";
import { chatText } from "./chatText";
import { ChatInputArea } from "./inputs/ChatInputArea";
import { MessageList } from "./MessageList";
import "./chat.css";

type Props = {
  /** Public ID of a published chat bot. */
  publicId: string;
  /** "test" for the builder's Test panel; live conversations also pass the embedding site. */
  context: ChatContext;
  /** Header of the Web Chat window (designed in the builder). Omitted = no header. */
  header?: ChatHeader;
  /** Shows a close button (Web Chat window). */
  onClose?: () => void;
};

export type ChatHeader = { title: string; subtitle?: string; avatarUrl?: string; backgroundColor?: string; textColor?: string };

/**
 * The chat UI. Used by the standalone chat page, the builder's Test panel and the
 * Web Chat iframe. To start a new conversation, remount it with a different `key`.
 */
export const ChatViewer = ({ publicId, context, header, onClose }: Props) => {
  const session = useChatSession(publicId, context);
  const appearance = useChatState(session, (state) => state.appearance);
  const progress = useChatState(session, (state) => state.progress);
  const style = useMemo(() => toCssVariables(appearance), [appearance]);

  return (
    <div className="chat" style={style}>
      {header && (
        <header className="chat__header" style={{ background: header.backgroundColor || undefined, color: header.textColor || undefined }}>
          {header.avatarUrl && <img className="chat__avatar" src={header.avatarUrl} alt="" />}
          <div className="chat__heading">
            <span className="chat__title">{header.title}</span>
            {header.subtitle && <span className="chat__subtitle">{header.subtitle}</span>}
          </div>
          {onClose && (
            <button type="button" className="chat__close" onClick={onClose} aria-label={chatText.close}>
              ✕
            </button>
          )}
        </header>
      )}
      {progress !== undefined && (
        <div className="chat__progress" role="progressbar" aria-valuenow={progress}>
          <div style={{ width: `${progress}%` }} />
        </div>
      )}
      <MessageList session={session} />
      <ChatInputArea session={session} />
    </div>
  );
};
