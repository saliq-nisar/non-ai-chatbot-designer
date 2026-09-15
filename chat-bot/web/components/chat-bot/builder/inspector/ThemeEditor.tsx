import type { ChatBotTheme } from "../../../../api/types";
import { defaultChatAppearance } from "../../../../theme/chatAppearance";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import { CheckboxField, ColorField, SelectField, TextField } from "./fields";

type Chat = NonNullable<ChatBotTheme["chat"]>;
type Part = "hostBubbles" | "guestBubbles" | "buttons" | "inputs";

const ROUNDNESS_OPTIONS = [
  { value: "none", label: "None" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

/** Saved with the chat bot (`theme`), applied by every chat renderer. */
export const ThemeEditor = () => {
  const dispatch = useBuilderDispatch();
  const theme = useBuilder((state) => state.chatBot.theme);
  const chat: Chat = theme.chat ?? {};
  const colors = defaultChatAppearance.colors;

  const setChat = (patch: Partial<Chat>) => dispatch({ type: "updateTheme", theme: { ...theme, chat: { ...chat, ...patch } } });
  const setPart = (part: Part, patch: Record<string, unknown>) => setChat({ [part]: { ...chat[part], ...patch } });

  const roundness = chat.hostBubbles?.border?.roundeness;
  const setRoundness = (value: "none" | "medium" | "large") => {
    const parts: Part[] = ["hostBubbles", "guestBubbles", "buttons", "inputs"];
    setChat(Object.fromEntries(parts.map((part) => [part, { ...chat[part], border: { ...chat[part]?.border, roundeness: value } }])));
  };

  const font = typeof theme.general?.font === "string" ? theme.general.font : theme.general?.font?.family;
  const background = theme.general?.background;

  return (
    <>
      <h4 className="inspector__section">General</h4>
      <TextField
        label="Font family"
        placeholder="System font"
        value={font}
        hint="Must be available on the page (e.g. Inter, Arial)."
        onChange={(family) =>
          dispatch({
            type: "updateTheme",
            theme: { ...theme, general: { ...theme.general, font: family ? { type: "Google", family } : undefined } },
          })
        }
      />
      <ColorField
        label="Background"
        value={background?.type === "Color" ? background.content : undefined}
        fallback={colors.background}
        onChange={(content) =>
          dispatch({
            type: "updateTheme",
            theme: { ...theme, general: { ...theme.general, background: content ? { type: "Color", content } : undefined } },
          })
        }
      />
      <SelectField label="Corner roundness" value={roundness === "custom" ? undefined : roundness ?? "medium"} options={ROUNDNESS_OPTIONS} onChange={setRoundness} />

      <h4 className="inspector__section">Bot messages</h4>
      <ColorField label="Background" value={chat.hostBubbles?.backgroundColor} fallback={colors.hostBubbleBackground} onChange={(v) => setPart("hostBubbles", { backgroundColor: v })} />
      <ColorField label="Text" value={chat.hostBubbles?.color} fallback={colors.hostBubbleText} onChange={(v) => setPart("hostBubbles", { color: v })} />
      <CheckboxField label="Show avatar" value={chat.hostAvatar?.isEnabled} onChange={(isEnabled) => setChat({ hostAvatar: { ...chat.hostAvatar, isEnabled } })} />
      {chat.hostAvatar?.isEnabled && (
        <TextField label="Avatar image URL" value={chat.hostAvatar?.url} onChange={(url) => setChat({ hostAvatar: { ...chat.hostAvatar, url: url || undefined } })} />
      )}

      <h4 className="inspector__section">Visitor messages</h4>
      <ColorField label="Background" value={chat.guestBubbles?.backgroundColor} fallback={colors.guestBubbleBackground} onChange={(v) => setPart("guestBubbles", { backgroundColor: v })} />
      <ColorField label="Text" value={chat.guestBubbles?.color} fallback={colors.guestBubbleText} onChange={(v) => setPart("guestBubbles", { color: v })} />

      <h4 className="inspector__section">Buttons</h4>
      <ColorField label="Background" value={chat.buttons?.backgroundColor} fallback={colors.buttonBackground} onChange={(v) => setPart("buttons", { backgroundColor: v })} />
      <ColorField label="Text" value={chat.buttons?.color} fallback={colors.buttonText} onChange={(v) => setPart("buttons", { color: v })} />
      <SelectField
        label="Buttons layout"
        value={chat.buttonsInput?.layout ?? "wrap"}
        options={[
          { value: "wrap", label: "Wrap" },
          { value: "vertical", label: "Vertical" },
        ]}
        onChange={(layout) => setChat({ buttonsInput: { layout } })}
      />

      <h4 className="inspector__section">Inputs</h4>
      <ColorField label="Background" value={chat.inputs?.backgroundColor} fallback={colors.inputBackground} onChange={(v) => setPart("inputs", { backgroundColor: v })} />
      <ColorField label="Text" value={chat.inputs?.color} fallback={colors.inputText} onChange={(v) => setPart("inputs", { color: v })} />
      <ColorField label="Placeholder" value={chat.inputs?.placeholderColor} fallback={colors.inputPlaceholder} onChange={(v) => setPart("inputs", { placeholderColor: v })} />
    </>
  );
};
