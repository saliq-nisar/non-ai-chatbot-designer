import { useState } from "react";
import { EVENT_LABELS, getBlockDefinition } from "../blocks/blockRegistry";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import { CheckboxField, TextField, VariableSelect } from "./fields";
import { SettingsEditor } from "./SettingsEditor";
import { ThemeEditor } from "./ThemeEditor";
import { VariablesEditor } from "./VariablesEditor";

/** Right panel: edits the selection, or the chat bot's theme/settings/variables when nothing is selected. */
export const Inspector = () => {
  const selection = useBuilder((state) => state.selection);
  if (selection?.kind === "block") return <BlockInspector key={selection.blockId} blockId={selection.blockId} />;
  if (selection?.kind === "group") return <GroupInspector key={selection.groupId} groupId={selection.groupId} />;
  if (selection?.kind === "event") return <EventInspector key={selection.eventId} eventId={selection.eventId} />;
  return <ChatBotInspector />;
};

const BlockInspector = ({ blockId }: { blockId: string }) => {
  const dispatch = useBuilderDispatch();
  const block = useBuilder((state) => {
    for (const group of state.chatBot.groups) {
      const found = group.blocks.find((b) => b.id === blockId);
      if (found) return found;
    }
    return undefined;
  });
  if (!block) return null;
  const { Editor, label } = getBlockDefinition(block.type);

  return (
    <div className="inspector">
      <div className="inspector__header">
        <h3 className="inspector__title">{label}</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => dispatch({ type: "select", selection: undefined })}>
          Close
        </button>
      </div>
      <Editor block={block} onChange={(updated) => dispatch({ type: "updateBlock", block: updated })} />
      <hr className="inspector__divider" />
      <button type="button" className="btn btn--sm btn--danger" onClick={() => dispatch({ type: "deleteBlock", blockId })}>
        Delete block
      </button>
    </div>
  );
};

const GroupInspector = ({ groupId }: { groupId: string }) => {
  const dispatch = useBuilderDispatch();
  const title = useBuilder((state) => state.chatBot.groups.find((group) => group.id === groupId)?.title);
  if (title === undefined) return null;

  return (
    <div className="inspector">
      <div className="inspector__header">
        <h3 className="inspector__title">Group</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => dispatch({ type: "select", selection: undefined })}>
          Close
        </button>
      </div>
      <label className="field">
        <span className="field__label">Title</span>
        <input className="input" value={title} onChange={(e) => dispatch({ type: "renameGroup", groupId, title: e.target.value })} />
      </label>
      <p className="field__hint">Drag blocks from the left panel into the group. Drag the title to move the group.</p>
      <hr className="inspector__divider" />
      <button type="button" className="btn btn--sm btn--danger" onClick={() => dispatch({ type: "deleteGroup", groupId })}>
        Delete group
      </button>
    </div>
  );
};

type EventOptions = { command?: string; resumeAfter?: boolean; contentVariableId?: string; inputNameVariableId?: string; inputTypeVariableId?: string };

const EVENT_HINTS: Record<string, string> = {
  reply: "Runs after every valid answer, then the conversation continues where it was.",
  invalidReply: "Runs instead of the retry message when an answer is invalid, then asks the question again.",
  command: "Runs when the chat receives this command (message { type: \"command\", command }).",
};

const EventInspector = ({ eventId }: { eventId: string }) => {
  const dispatch = useBuilderDispatch();
  const event = useBuilder((state) => state.chatBot.events.find((e) => e.id === eventId));
  if (!event) return null;
  const options = (event.options ?? {}) as EventOptions;
  const set = (patch: Partial<EventOptions>) => dispatch({ type: "updateEvent", event: { ...event, options: { ...options, ...patch } } });

  return (
    <div className="inspector">
      <div className="inspector__header">
        <h3 className="inspector__title">{EVENT_LABELS[event.type] ?? event.type} event</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => dispatch({ type: "select", selection: undefined })}>
          Close
        </button>
      </div>
      <p className="field__hint">{EVENT_HINTS[event.type]}</p>
      {event.type === "command" ? (
        <>
          <TextField label="Command" placeholder="start" value={options.command} onChange={(command) => set({ command: command || undefined })} />
          <CheckboxField label="Resume the conversation afterwards" value={options.resumeAfter} onChange={(resumeAfter) => set({ resumeAfter })} />
        </>
      ) : (
        <>
          <VariableSelect label="Save the answer in" value={options.contentVariableId} onChange={(contentVariableId) => set({ contentVariableId })} />
          <VariableSelect label="Save the question name in" value={options.inputNameVariableId} onChange={(inputNameVariableId) => set({ inputNameVariableId })} />
          <VariableSelect label="Save the input type in" value={options.inputTypeVariableId} onChange={(inputTypeVariableId) => set({ inputTypeVariableId })} />
        </>
      )}
      <hr className="inspector__divider" />
      <button type="button" className="btn btn--sm btn--danger" onClick={() => dispatch({ type: "deleteEvent", eventId })}>
        Delete event
      </button>
    </div>
  );
};

const TABS = { theme: "Theme", settings: "Settings", variables: "Variables" } as const;

const ChatBotInspector = () => {
  const [tab, setTab] = useState<keyof typeof TABS>("theme");
  return (
    <div className="inspector">
      <div className="tabs" role="tablist">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tabs__tab${tab === key ? " is-active" : ""}`}
            onClick={() => setTab(key)}
          >
            {TABS[key]}
          </button>
        ))}
      </div>
      {tab === "theme" && <ThemeEditor />}
      {tab === "settings" && <SettingsEditor />}
      {tab === "variables" && <VariablesEditor />}
    </div>
  );
};
