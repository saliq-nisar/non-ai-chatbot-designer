import type { Item } from "../../../../../api/types";
import { CheckboxField, TextField, VariableSelect } from "../../inspector/fields";
import { createId } from "../../state/createId";
import { type BlockEditorProps, option, withOptions } from "../blockHelpers";

type ItemField = { key: string; label: string; placeholder?: string };

const BUTTON_FIELDS: ItemField[] = [
  { key: "content", label: "Label" },
  { key: "value", label: "Saved value", placeholder: "Same as label" },
];
const PICTURE_FIELDS: ItemField[] = [
  { key: "pictureSrc", label: "Image URL" },
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "value", label: "Saved value", placeholder: "Same as title" },
];

/** Buttons ("choice input") and picture choice: each item can lead to its own group. */
export const ChoiceInputEditor = ({ block, onChange }: BlockEditorProps) => {
  const isPicture = block.type === "picture choice input";
  const fields = isPicture ? PICTURE_FIELDS : BUTTON_FIELDS;
  const items = block.items ?? [];

  const updateItem = (itemId: string, key: string, value: string) =>
    onChange({ ...block, items: items.map((item) => (item.id === itemId ? { ...item, [key]: value || undefined } : item)) });

  const addItem = () => {
    const item: Item = { id: createId(), ...(isPicture ? {} : { content: `Option ${items.length + 1}` }) };
    onChange({ ...block, items: [...items, item] });
  };

  const removeItem = (itemId: string) => onChange({ ...block, items: items.filter((item) => item.id !== itemId) });

  return (
    <>
      <div className="field">
        <span className="field__label">{isPicture ? "Pictures" : "Buttons"}</span>
        {items.map((item, index) => (
          <fieldset key={item.id} className="item-editor">
            <legend>
              #{index + 1}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => removeItem(item.id)}
                disabled={items.length <= 1}
                aria-label="Remove"
              >
                Remove
              </button>
            </legend>
            {fields.map((field) => (
              <input
                key={field.key}
                className="input"
                aria-label={field.label}
                placeholder={field.placeholder ?? field.label}
                value={(item[field.key] as string | undefined) ?? ""}
                onChange={(e) => updateItem(item.id, field.key, e.target.value)}
              />
            ))}
          </fieldset>
        ))}
        <button type="button" className="btn btn--sm" onClick={addItem}>
          Add {isPicture ? "picture" : "button"}
        </button>
      </div>
      <CheckboxField
        label="Multiple choice"
        value={option<boolean>(block, "isMultipleChoice")}
        onChange={(isMultipleChoice) => onChange(withOptions(block, { isMultipleChoice }))}
      />
      {option<boolean>(block, "isMultipleChoice") && (
        <TextField
          label="Submit button label"
          placeholder="Send"
          value={option<string>(block, "buttonLabel")}
          onChange={(buttonLabel) => onChange(withOptions(block, { buttonLabel }))}
        />
      )}
      <VariableSelect
        label="Save the answer in"
        value={option<string>(block, "variableId")}
        onChange={(variableId) => onChange(withOptions(block, { variableId }))}
      />
    </>
  );
};
