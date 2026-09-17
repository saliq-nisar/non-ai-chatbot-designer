import type { ComponentType } from "react";
import type { ChatSession } from "../../runtime/chatSession";
import { useChatState } from "../../runtime/useChatSession";
import { chatText } from "../chatText";
import { CardsInput } from "./CardsInput";
import { ChoiceInput } from "./ChoiceInput";
import { FileInput } from "./FileInput";
import { LiveAgentInput } from "./LiveAgentInput";
import { PaymentInput } from "./PaymentInput";
import { RatingInput } from "./RatingInput";
import { TextAnswerInput } from "./TextAnswerInput";
import type { InputProps } from "./types";

/** Input block type -> component. Register or replace an input renderer here. */
export const inputRenderers: Record<string, ComponentType<InputProps>> = {
  "text input": TextAnswerInput,
  "number input": TextAnswerInput,
  "email input": TextAnswerInput,
  "url input": TextAnswerInput,
  "phone number input": TextAnswerInput,
  "date input": TextAnswerInput,
  "time input": TextAnswerInput,
  "choice input": ChoiceInput,
  "picture choice input": ChoiceInput,
  "rating input": RatingInput,
  "file input": FileInput,
  "payment input": PaymentInput,
  cards: CardsInput,
};

export const ChatInputArea = ({ session, onRestart }: { session: ChatSession; onRestart: () => void }) => {
  const input = useChatState(session, (state) => state.input);
  const status = useChatState(session, (state) => state.status);
  const error = useChatState(session, (state) => state.error);
  const canRetry = useChatState(session, (state) => state.canRetry !== false);
  const hasMessages = useChatState(session, (state) => state.entries.length > 0);
  const isLiveAgentMode = useChatState(session, (state) => state.isLiveAgentMode);

  // Nothing to show and nothing to retry (e.g. unknown or closed chat bot): a centered notice.
  if (status === "error" && !canRetry && !hasMessages)
    return (
      <div className="chat__unavailable" role="alert">
        <strong>{chatText.unavailable}</strong>
        <span>{error}</span>
      </div>
    );

  if (status === "error")
    return (
      <div className="chat__footer chat__status chat__status--error" role="alert">
        <span>{error}</span>
        {canRetry ? (
          <button type="button" className="chat__button" onClick={session.retry}>
            {chatText.retry}
          </button>
        ) : (
          <button type="button" className="chat__button" onClick={onRestart}>
            {chatText.restart}
          </button>
        )}
      </div>
    );

  // After the flow (or when an agent took over) the visitor writes freely to the live agent.
  if (isLiveAgentMode && status !== "starting" && status !== "sending" && status !== "botTyping")
    return (
      <div className="chat__footer">
        {error && (
          <div className="chat__field-error" role="alert">
            {error}
          </div>
        )}
        <LiveAgentInput onSend={session.sendLiveAgentMessage} />
      </div>
    );

  if (status !== "waitingForInput" || !input) return null;

  const Renderer = inputRenderers[input.type];
  return (
    <div className="chat__footer">
      {Renderer ? (
        // key: a new question always starts with a fresh input state
        <Renderer key={input.id} input={input} onAnswer={session.answer} onSkip={session.skip} uploadFiles={session.uploadFiles} />
      ) : (
        <div className="chat__status">{chatText.unsupportedInput}</div>
      )}
    </div>
  );
};
