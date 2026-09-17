import { type FormEvent, type KeyboardEvent, useState } from "react";
import { chatText } from "../chatText";
import type { InputProps } from "./types";

type Labels = { placeholder?: string; button?: string; from?: string; to?: string };

const HTML_INPUT_TYPES: Record<string, string> = {
  "text input": "text",
  "number input": "number",
  "email input": "email",
  "url input": "url",
  "phone number input": "tel",
  "time input": "time",
};

/** Free-text style questions: text, number, email, URL, phone, date and time. */
export const TextAnswerInput = ({ input, onAnswer }: InputProps) => {
  const options = input.options ?? {};
  const labels = (options.labels ?? {}) as Labels;
  const isDate = input.type === "date input";
  const isRange = isDate && options.isRange === true;
  const isLong = input.type === "text input" && options.isLong === true;

  const [value, setValue] = useState(input.prefilledValue ?? "");
  const [rangeEnd, setRangeEnd] = useState("");

  const submit = (event: FormEvent | KeyboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || (isRange && !rangeEnd)) return;
    onAnswer({ value: isRange ? `${trimmed} to ${rangeEnd}` : trimmed });
  };

  const htmlType = isDate ? (options.hasTime ? "datetime-local" : "date") : (HTML_INPUT_TYPES[input.type] ?? "text");
  const common = {
    className: "chat__input",
    autoFocus: true,
    placeholder: labels.placeholder ?? chatText.placeholders[input.type],
  };

  return (
    // noValidate: answers are validated by the chat bot, which shows its own (configurable) retry message.
    <form className="chat__answer" onSubmit={submit} noValidate>
      {isLong ? (
        <textarea
          {...common}
          rows={3}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
          }}
        />
      ) : isRange ? (
        <div className="chat__range">
          <label>
            {labels.from ?? chatText.dateFrom}
            <input {...common} type={htmlType} value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label>
            {labels.to ?? chatText.dateTo}
            <input className="chat__input" type={htmlType} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
          </label>
        </div>
      ) : (
        <input
          {...common}
          type={htmlType}
          value={value}
          min={options.min as string | number | undefined}
          max={options.max as string | number | undefined}
          step={input.type === "number input" ? ((options.step as number | undefined) ?? "any") : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <button type="submit" className="chat__button" disabled={!value.trim()}>
        {labels.button ?? chatText.sendButton}
      </button>
    </form>
  );
};
