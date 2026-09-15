import { useState } from "react";
import { chatText } from "../chatText";
import type { InputProps } from "./types";

type ChoiceItem = { id: string; content?: string; value?: string; pictureSrc?: string; title?: string; description?: string };

/** Buttons ("choice input") and picture choices, single or multiple selection. */
export const ChoiceInput = ({ input, onAnswer }: InputProps) => {
  const items = (input.items ?? []) as ChoiceItem[];
  const isPicture = input.type === "picture choice input";
  const isMultiple = input.options?.isMultipleChoice === true;
  const buttonLabel = (input.options?.buttonLabel as string | undefined) ?? chatText.sendButton;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Same value/label rules as the existing widget.
  const labelOf = (item: ChoiceItem) => (isPicture ? item.title ?? item.pictureSrc : item.content) ?? "";
  const valueOf = (item: ChoiceItem) => item.value || labelOf(item);

  const choose = (item: ChoiceItem) => {
    if (!isMultiple) return onAnswer({ value: valueOf(item), label: labelOf(item) });
    setSelectedIds((ids) => (ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]));
  };

  const submitMultiple = () => {
    const selected = items.filter((item) => selectedIds.includes(item.id));
    if (selected.length === 0) return;
    onAnswer({ value: selected.map(valueOf).join(", "), label: selected.map(labelOf).join(", ") });
  };

  return (
    <div className="chat__answer chat__answer--choices">
      <div className={isPicture ? "chat__pictures" : "chat__choices"}>
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`chat__choice${isPicture ? " chat__choice--picture" : ""}${isSelected ? " is-selected" : ""}`}
              aria-pressed={isMultiple ? isSelected : undefined}
              onClick={() => choose(item)}
            >
              {isPicture && item.pictureSrc && <img src={item.pictureSrc} alt="" loading="lazy" />}
              <span>{labelOf(item)}</span>
              {isPicture && item.description && <small>{item.description}</small>}
            </button>
          );
        })}
      </div>
      {isMultiple && (
        <button type="button" className="chat__button" disabled={selectedIds.length === 0} onClick={submitMultiple}>
          {buttonLabel}
        </button>
      )}
    </div>
  );
};
