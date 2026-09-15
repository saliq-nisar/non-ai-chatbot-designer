import { type FormEvent, useState } from "react";
import { chatText } from "../chatText";

/**
 * Free-text box shown once the bot stopped driving the conversation (flow ended, or a live
 * agent sent a message). Messages are relayed to the live agent, not to the flow.
 */
export const LiveAgentInput = ({ onSend }: { onSend: (message: string) => void }) => {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };

  return (
    <form className="chat__answer" onSubmit={submit}>
      <input className="chat__input" autoFocus value={value} placeholder={chatText.liveAgentPlaceholder} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="chat__button" disabled={!value.trim()}>
        {chatText.sendButton}
      </button>
    </form>
  );
};
