import { memo, useLayoutEffect, useRef } from "react";
import type { ChatEntry, ChatSession } from "../runtime/chatSession";
import { useChatState } from "../runtime/useChatSession";
import { BotBubble } from "./BotBubble";
import { chatText } from "./chatText";

// Entries never change once shown, so each renders exactly once.
const EntryView = memo(({ entry, avatarUrl }: { entry: ChatEntry; avatarUrl?: string }) =>
  entry.kind === "user" ? (
    <div className="chat__row chat__row--guest">
      <div className="chat__bubble chat__bubble--guest">{entry.text}</div>
    </div>
  ) : (
    <div className="chat__row chat__row--host">
      {avatarUrl && <img className="chat__avatar" src={avatarUrl} alt="" />}
      <BotBubble bubble={entry.bubble} />
    </div>
  ),
);

export const MessageList = ({ session }: { session: ChatSession }) => {
  const entries = useChatState(session, (state) => state.entries);
  const status = useChatState(session, (state) => state.status);
  const avatar = useChatState(session, (state) => state.appearance.avatar);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message (or the typing indicator) in view.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries, status]);

  const avatarUrl = avatar.isHostEnabled ? avatar.hostUrl : undefined;

  return (
    <div ref={scrollRef} className="chat__messages" aria-live="polite">
      <div className="chat__messages-inner">
        {entries.map((entry) => (
          <EntryView key={entry.id} entry={entry} avatarUrl={avatarUrl} />
        ))}
        {(status === "botTyping" || status === "starting" || status === "sending") && (
          <div className="chat__row chat__row--host">
            <div className="chat__bubble chat__bubble--host chat__typing" aria-label={chatText.typing}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
