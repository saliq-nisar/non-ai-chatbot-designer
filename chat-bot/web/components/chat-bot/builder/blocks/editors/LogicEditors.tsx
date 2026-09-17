import { useEffect, useState } from "react";
import { chatBotApi } from "../../../../../api/chatBotApi";
import type { Item } from "../../../../../api/types";
import { appConfig } from "../../../../../config";
import { CheckboxField, NumberField, SelectField, TextField, VariableSelect } from "../../inspector/fields";
import { createId } from "../../state/createId";
import { shallowEqual, useBuilder } from "../../state/builderStore";
import { type BlockEditorProps, option, withOptions } from "../blockHelpers";

/** Value types the chat runtime evaluates when the block runs (see server/engine/logic.ts). */
export const SET_VARIABLE_TYPES = [
  "Custom",
  "Empty",
  "Append value(s)",
  "Now",
  "Today",
  "Yesterday",
  "Tomorrow",
  "Random ID",
  "Result ID",
  "Moment of the day",
  "Environment name",
  "Transcript",
] as const;

export const SetVariableEditor = ({ block, onChange }: BlockEditorProps) => {
  const type = option<string>(block, "type") ?? "Custom";
  return (
    <>
      <VariableSelect
        label="Variable"
        value={option<string>(block, "variableId")}
        onChange={(variableId) => onChange(withOptions(block, { variableId }))}
      />
      <SelectField
        label="Value"
        value={type}
        options={SET_VARIABLE_TYPES.map((value) => ({ value, label: value }))}
        onChange={(value) => onChange(withOptions(block, { type: value }))}
      />
      {type === "Custom" && (
        <TextField
          label="Value to set"
          multiline
          hint="Text, {{Another variable}}, or number arithmetic such as {{Score}} + 1."
          value={option<string>(block, "expressionToEvaluate")}
          onChange={(expressionToEvaluate) => onChange(withOptions(block, { expressionToEvaluate }))}
        />
      )}
      {type === "Append value(s)" && (
        <TextField
          label="Value to append"
          hint="Adds this value to the variable's list."
          value={option<string>(block, "item")}
          onChange={(item) => onChange(withOptions(block, { item }))}
        />
      )}
    </>
  );
};

/** Comparison operators understood by the backend. */
export const COMPARISON_OPERATORS = [
  "Equal to",
  "Not equal",
  "Contains",
  "Does not contain",
  "Greater than",
  "Greater or equal to",
  "Less than",
  "Less or equal to",
  "Is set",
  "Is empty",
  "Starts with",
  "Ends with",
  "Matches regex",
  "Does not match regex",
] as const;

const VALUELESS_OPERATORS = new Set(["Is set", "Is empty"]);

type Comparison = { id: string; variableId?: string; comparisonOperator?: string; value?: string };
type Condition = { logicalOperator?: "AND" | "OR"; comparisons?: Comparison[] };

export const newConditionItem = (): Item => ({
  id: createId(),
  content: { logicalOperator: "AND", comparisons: [{ id: createId(), comparisonOperator: "Equal to" }] },
});

/** Each item is one "if" branch with its own outgoing path; the block's own path is "else". */
export const ConditionEditor = ({ block, onChange }: BlockEditorProps) => {
  const items = block.items ?? [];

  const updateCondition = (itemId: string, update: (condition: Condition) => Condition) =>
    onChange({
      ...block,
      items: items.map((item) => (item.id === itemId ? { ...item, content: update((item.content ?? {}) as Condition) } : item)),
    });

  return (
    <>
      {items.map((item, index) => {
        const condition = (item.content ?? {}) as Condition;
        const comparisons = condition.comparisons ?? [];
        const updateComparison = (comparisonId: string, patch: Partial<Comparison>) =>
          updateCondition(item.id, (c) => ({
            ...c,
            comparisons: comparisons.map((comparison) => (comparison.id === comparisonId ? { ...comparison, ...patch } : comparison)),
          }));

        return (
          <fieldset key={item.id} className="item-editor">
            <legend>
              Branch #{index + 1}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={items.length <= 1}
                onClick={() => onChange({ ...block, items: items.filter((i) => i.id !== item.id) })}
              >
                Remove
              </button>
            </legend>
            {comparisons.map((comparison) => (
              <div key={comparison.id} className="comparison">
                <VariableSelect
                  label="Variable"
                  value={comparison.variableId}
                  onChange={(variableId) => updateComparison(comparison.id, { variableId })}
                />
                <SelectField
                  label="Operator"
                  value={comparison.comparisonOperator ?? "Equal to"}
                  options={COMPARISON_OPERATORS.map((value) => ({ value, label: value }))}
                  onChange={(comparisonOperator) => updateComparison(comparison.id, { comparisonOperator })}
                />
                {!VALUELESS_OPERATORS.has(comparison.comparisonOperator ?? "") && (
                  <TextField label="Value" value={comparison.value} onChange={(value) => updateComparison(comparison.id, { value })} />
                )}
                {comparisons.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => updateCondition(item.id, (c) => ({ ...c, comparisons: comparisons.filter((x) => x.id !== comparison.id) }))}
                  >
                    Remove comparison
                  </button>
                )}
              </div>
            ))}
            <div className="field--inline">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  updateCondition(item.id, (c) => ({ ...c, comparisons: [...comparisons, { id: createId(), comparisonOperator: "Equal to" }] }))
                }
              >
                Add comparison
              </button>
              {comparisons.length > 1 && (
                <select
                  className="select"
                  aria-label="Combine comparisons with"
                  value={condition.logicalOperator ?? "AND"}
                  onChange={(e) => updateCondition(item.id, (c) => ({ ...c, logicalOperator: e.target.value as "AND" | "OR" }))}
                >
                  <option value="AND">All must match (AND)</option>
                  <option value="OR">Any can match (OR)</option>
                </select>
              )}
            </div>
          </fieldset>
        );
      })}
      <button type="button" className="btn btn--sm" onClick={() => onChange({ ...block, items: [...items, newConditionItem()] })}>
        Add branch
      </button>
      <p className="field__hint">The block's bottom port ("Else") is used when no branch matches.</p>
    </>
  );
};

export const RedirectEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <TextField label="URL" placeholder="https://" value={option<string>(block, "url")} onChange={(url) => onChange(withOptions(block, { url }))} />
    <CheckboxField label="Open in a new tab" value={option<boolean>(block, "isNewTab")} onChange={(isNewTab) => onChange(withOptions(block, { isNewTab }))} />
  </>
);

export const WaitEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <NumberField
      label="Seconds to wait"
      min={0}
      value={option<string>(block, "secondsToWaitFor") ? Number(option<string>(block, "secondsToWaitFor")) : undefined}
      // Stored as a string (it may also hold a {{variable}}).
      onChange={(seconds) => onChange(withOptions(block, { secondsToWaitFor: seconds === undefined ? undefined : String(seconds) }))}
    />
    <CheckboxField label="Pause the flow until the wait is over" value={option<boolean>(block, "shouldPause")} onChange={(shouldPause) => onChange(withOptions(block, { shouldPause }))} />
  </>
);

/** "id<separator>title" pairs keep the selector result a flat array of strings (cheap to compare). */
const SEPARATOR = "";

const useGroupOptions = () =>
  useBuilder((state) => state.chatBot.groups.map((group) => `${group.id}${SEPARATOR}${group.title}`), shallowEqual).map((entry) => {
    const [value, label] = entry.split(SEPARATOR) as [string, string];
    return { value, label };
  });

export const JumpEditor = ({ block, onChange }: BlockEditorProps) => {
  const groups = useGroupOptions();
  return (
    <>
      <SelectField
        label="Jump to group"
        value={option<string>(block, "groupId") ?? ""}
        options={[{ value: "", label: "— select a group —" }, ...groups]}
        onChange={(groupId) => onChange(withOptions(block, { groupId, blockId: undefined }))}
      />
      <p className="field__hint">A Return block later in that path comes back here.</p>
    </>
  );
};

export const CodeEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <TextField label="Name" placeholder="Script" value={option<string>(block, "name")} onChange={(name) => onChange(withOptions(block, { name }))} />
    <TextField
      label="JavaScript"
      multiline
      placeholder={'console.log({{Name}});'}
      hint="Runs in the visitor's browser. {{Variable}} references are available as values."
      value={option<string>(block, "content")}
      onChange={(content) => onChange(withOptions(block, { content, isExecutedOnClient: true }))}
    />
    <CheckboxField
      label="Run on the website hosting the Web Chat"
      value={option<boolean>(block, "shouldExecuteInParentContext")}
      onChange={(shouldExecuteInParentContext) => onChange(withOptions(block, { shouldExecuteInParentContext }))}
    />
  </>
);

export const AbTestEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <NumberField
      label="Percent of visitors going to A"
      min={0}
      max={100}
      value={option<number>(block, "aPercent") ?? 50}
      onChange={(aPercent) => onChange(withOptions(block, { aPercent: aPercent === undefined ? undefined : Math.min(100, Math.max(0, aPercent)) }))}
    />
    <p className="field__hint">Connect the A and B ports to the two paths.</p>
  </>
);

type ChatBotOption = { id: string; name: string };

/** Links to another chat bot (or a group of this one); the conversation continues there. */
export const ChatBotLinkEditor = ({ block, onChange }: BlockEditorProps) => {
  const currentId = useBuilder((state) => state.chatBot.id);
  const currentGroups = useGroupOptions();
  const linked = option<string>(block, "chatBotId");
  const [chatBots, setChatBots] = useState<ChatBotOption[]>();
  const [linkedGroups, setLinkedGroups] = useState<{ value: string; label: string }[]>();

  useEffect(() => {
    let isCurrent = true;
    chatBotApi.listChatBots(appConfig.workspaceId).then((list) => isCurrent && setChatBots(list.filter((bot) => bot.id !== currentId)));
    return () => {
      isCurrent = false;
    };
  }, [currentId]);

  useEffect(() => {
    if (!linked || linked === "current") return setLinkedGroups(undefined);
    let isCurrent = true;
    chatBotApi.getChatBot(linked).then((bot) => isCurrent && setLinkedGroups(bot.groups.map((group) => ({ value: group.id, label: group.title }))));
    return () => {
      isCurrent = false;
    };
  }, [linked]);

  const groups = linked === "current" ? currentGroups : linkedGroups;

  return (
    <>
      <SelectField
        label="Chat bot"
        value={linked ?? ""}
        options={[{ value: "", label: "— select —" }, { value: "current", label: "This chat bot" }, ...(chatBots ?? []).map((bot) => ({ value: bot.id, label: bot.name }))]}
        onChange={(chatBotId) => onChange(withOptions(block, { chatBotId, groupId: undefined }))}
      />
      {groups && (
        <SelectField
          label="Start at group"
          value={option<string>(block, "groupId") ?? ""}
          options={[{ value: "", label: "Start of the chat bot" }, ...groups]}
          onChange={(groupId) => onChange(withOptions(block, { groupId }))}
        />
      )}
      {linked && linked !== "current" && (
        <>
          <CheckboxField label="Bring variables back when it ends" value={option<boolean>(block, "mergeResults")} onChange={(mergeResults) => onChange(withOptions(block, { mergeResults }))} />
          <p className="field__hint">The linked chat bot must be published. Variables with the same name are shared.</p>
        </>
      )}
    </>
  );
};
