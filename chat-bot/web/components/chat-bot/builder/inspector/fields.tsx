import { type ReactNode, useId, useState } from "react";
import { createId } from "../state/createId";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";

/** Small form controls used by every editor panel. */

type FieldProps<T> = { label: string; value: T; onChange: (value: T) => void; hint?: ReactNode };

export const TextField = ({
  label,
  value,
  onChange,
  hint,
  placeholder,
  multiline,
}: { label: string; value: string | undefined; onChange: (value: string) => void; hint?: ReactNode; placeholder?: string; multiline?: boolean }) => {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="textarea" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
};

export const NumberField = ({ label, value, onChange, hint, min, max, step }: FieldProps<number | undefined> & { min?: number; max?: number; step?: number }) => {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        min={min}
        max={max}
        step={step ?? "any"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
};

export const CheckboxField = ({ label, value, onChange }: FieldProps<boolean | undefined>) => (
  <label className="field field--inline">
    <input type="checkbox" checked={value ?? false} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

export const SelectField = <T extends string>({
  label,
  value,
  onChange,
  options,
}: { label: string; value: T | undefined; onChange: (value: T) => void; options: readonly { value: T; label: string }[] }) => {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const ColorField = ({ label, value, fallback, onChange }: FieldProps<string | undefined> & { fallback: string }) => (
  <div className="field field--inline field--color">
    <input
      type="color"
      className="input input--color"
      value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : fallback}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
    <span>{label}</span>
    {value && (
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(undefined)}>
        Reset
      </button>
    )}
  </div>
);

/** Picks a variable of the chat bot, or creates a new one. */
export const VariableSelect = ({ label, value, onChange }: FieldProps<string | undefined>) => {
  const id = useId();
  const variables = useBuilder((state) => state.chatBot.variables);
  const dispatch = useBuilderDispatch();
  const [newName, setNewName] = useState<string>();

  const create = () => {
    const name = newName?.trim();
    if (!name) return setNewName(undefined);
    const existing = variables.find((variable) => variable.name === name);
    const variableId = existing?.id ?? createId();
    if (!existing) dispatch({ type: "addVariable", variable: { id: variableId, name } });
    onChange(variableId);
    setNewName(undefined);
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {newName === undefined ? (
        <div className="field--inline">
          <select id={id} className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">— none —</option>
            {variables.map((variable) => (
              <option key={variable.id} value={variable.id}>
                {variable.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--sm" onClick={() => setNewName("")}>
            New
          </button>
        </div>
      ) : (
        <div className="field--inline">
          <input
            id={id}
            className="input"
            autoFocus
            placeholder="Variable name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setNewName(undefined);
            }}
          />
          <button type="button" className="btn btn--sm btn--primary" onClick={create}>
            Add
          </button>
        </div>
      )}
    </div>
  );
};

export const useVariableName = (variableId: unknown) =>
  useBuilder((state) => (typeof variableId === "string" ? state.chatBot.variables.find((v) => v.id === variableId)?.name : undefined));
