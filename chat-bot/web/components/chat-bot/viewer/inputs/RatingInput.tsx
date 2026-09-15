import { useState } from "react";
import { chatText } from "../chatText";
import type { InputProps } from "./types";

type RatingOptions = {
  buttonType?: "Icons" | "Numbers";
  length?: number;
  startsAt?: number | string;
  labels?: { left?: string; right?: string; button?: string };
  isOneClickSubmitEnabled?: boolean;
};

export const RatingInput = ({ input, onAnswer }: InputProps) => {
  const options = (input.options ?? {}) as RatingOptions;
  const length = options.length ?? 10;
  const startsAt = Number(options.startsAt ?? 0) || 0;
  const isIcons = options.buttonType === "Icons";
  const [selected, setSelected] = useState<number>();

  const values = Array.from({ length: isIcons ? length : length - startsAt + 1 }, (_, index) =>
    isIcons ? index + 1 : startsAt + index,
  );

  const select = (value: number) => {
    if (options.isOneClickSubmitEnabled) return onAnswer({ value: String(value) });
    setSelected(value);
  };

  return (
    <div className="chat__answer chat__answer--rating">
      <div className="chat__rating">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={`chat__choice chat__rating-item${
              selected !== undefined && (isIcons ? value <= selected : value === selected) ? " is-selected" : ""
            }`}
            aria-label={String(value)}
            onClick={() => select(value)}
          >
            {isIcons ? "★" : value}
          </button>
        ))}
      </div>
      {(options.labels?.left || options.labels?.right) && (
        <div className="chat__rating-labels">
          <span>{options.labels?.left}</span>
          <span>{options.labels?.right}</span>
        </div>
      )}
      {!options.isOneClickSubmitEnabled && (
        <button
          type="button"
          className="chat__button"
          disabled={selected === undefined}
          onClick={() => selected !== undefined && onAnswer({ value: String(selected) })}
        >
          {options.labels?.button ?? chatText.sendButton}
        </button>
      )}
    </div>
  );
};
