import type { ChatBotSettings } from "../../../../api/types";
import { defaultPublicId, isValidPublicId } from "../state/createId";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import { CheckboxField, NumberField, TextField } from "./fields";

type Typing = NonNullable<ChatBotSettings["typingEmulation"]>;

export const SettingsEditor = () => {
  const dispatch = useBuilderDispatch();
  const settings = useBuilder((state) => state.chatBot.settings);
  const publicId = useBuilder((state) => state.chatBot.publicId);
  const name = useBuilder((state) => state.chatBot.name);
  const chatBotId = useBuilder((state) => state.chatBot.id);
  const typing: Typing = settings.typingEmulation ?? {};

  const setTyping = (patch: Partial<Typing>) =>
    dispatch({ type: "updateSettings", settings: { ...settings, typingEmulation: { ...typing, ...patch } } });

  return (
    <>
      <h4 className="inspector__section">Public ID</h4>
      <TextField
        label="Public ID"
        value={publicId ?? ""}
        placeholder={defaultPublicId(name, chatBotId)}
        hint={
          publicId && !isValidPublicId(publicId)
            ? "Only lowercase letters, numbers and dashes — this value will be ignored."
            : "Used by the Web Chat script and the chat link. Set automatically on first publish."
        }
        onChange={(value) => dispatch({ type: "setPublicId", publicId: value.trim().toLowerCase() || null })}
      />

      <h4 className="inspector__section">Typing emulation</h4>
      <CheckboxField label="Show “typing…” before bot messages" value={typing.enabled ?? true} onChange={(enabled) => setTyping({ enabled })} />
      {(typing.enabled ?? true) && (
        <>
          <NumberField label="Words per minute" min={1} value={typing.speed ?? 400} onChange={(speed) => setTyping({ speed })} />
          <NumberField label="Max delay (seconds)" min={0} step={0.1} value={typing.maxDelay ?? 3} onChange={(maxDelay) => setTyping({ maxDelay })} />
          <CheckboxField
            label="Skip on the first message"
            value={typing.isDisabledOnFirstMessage ?? true}
            onChange={(isDisabledOnFirstMessage) => setTyping({ isDisabledOnFirstMessage })}
          />
        </>
      )}
      <NumberField
        label="Delay between messages (seconds)"
        min={0}
        max={5}
        step={0.1}
        value={typing.delayBetweenBubbles ?? 0}
        onChange={(delayBetweenBubbles) => setTyping({ delayBetweenBubbles })}
      />
    </>
  );
};
