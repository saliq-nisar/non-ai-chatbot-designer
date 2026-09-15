import { createId } from "../state/createId";
import { VariableSelect } from "./fields";

/** Editable lists used by integration editors. Each row keeps a stable `id`. */

type Row = { id: string; [field: string]: unknown };

const ListShell = ({ label, children, onAdd, addLabel }: { label: string; children: React.ReactNode; onAdd: () => void; addLabel: string }) => (
  <div className="field">
    <span className="field__label">{label}</span>
    <div className="list-field">{children}</div>
    <button type="button" className="btn btn--sm" onClick={onAdd}>
      {addLabel}
    </button>
  </div>
);

const RemoveButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="btn btn--ghost btn--sm" onClick={onClick} aria-label="Remove">
    ✕
  </button>
);

/** key/value pairs (headers, query params, pixel params). */
export const KeyValueList = ({ label, rows = [], onChange, keyPlaceholder = "Key", valuePlaceholder = "Value" }: {
  label: string;
  rows?: Row[];
  onChange: (rows: Row[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) => (
  <ListShell label={label} addLabel="Add" onAdd={() => onChange([...rows, { id: createId() }])}>
    {rows.map((row) => (
      <div key={row.id} className="list-field__row">
        <input className="input" placeholder={keyPlaceholder} value={(row.key as string) ?? ""} onChange={(e) => onChange(rows.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))} />
        <input className="input" placeholder={valuePlaceholder} value={(row.value as string) ?? ""} onChange={(e) => onChange(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))} />
        <RemoveButton onClick={() => onChange(rows.filter((r) => r.id !== row.id))} />
      </div>
    ))}
  </ListShell>
);

/** Plain list of strings (email recipients). Stored as string[]. */
export const TextList = ({ label, values = [], onChange, placeholder }: { label: string; values?: string[]; onChange: (values: string[]) => void; placeholder?: string }) => (
  <ListShell label={label} addLabel="Add" onAdd={() => onChange([...values, ""])}>
    {values.map((value, index) => (
      <div key={index} className="list-field__row">
        <input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))} />
        <RemoveButton onClick={() => onChange(values.filter((_, i) => i !== index))} />
      </div>
    ))}
  </ListShell>
);

/** Save part of a response into a variable: `field` is free text or a choice. */
export const VariableMappingList = ({ label, rows = [], onChange, field, fieldPlaceholder, fieldOptions }: {
  label: string;
  rows?: Row[];
  onChange: (rows: Row[]) => void;
  field: string;
  fieldPlaceholder?: string;
  fieldOptions?: readonly string[];
}) => (
  <ListShell label={label} addLabel="Add" onAdd={() => onChange([...rows, { id: createId() }])}>
    {rows.map((row) => (
      <div key={row.id} className="list-field__block">
        {fieldOptions ? (
          <select className="select" value={(row[field] as string) ?? ""} onChange={(e) => onChange(rows.map((r) => (r.id === row.id ? { ...r, [field]: e.target.value } : r)))}>
            <option value="">— select —</option>
            {fieldOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input className="input" placeholder={fieldPlaceholder} value={(row[field] as string) ?? ""} onChange={(e) => onChange(rows.map((r) => (r.id === row.id ? { ...r, [field]: e.target.value } : r)))} />
        )}
        <VariableSelect label="Save in" value={row.variableId as string | undefined} onChange={(variableId) => onChange(rows.map((r) => (r.id === row.id ? { ...r, variableId } : r)))} />
        <RemoveButton onClick={() => onChange(rows.filter((r) => r.id !== row.id))} />
      </div>
    ))}
  </ListShell>
);
