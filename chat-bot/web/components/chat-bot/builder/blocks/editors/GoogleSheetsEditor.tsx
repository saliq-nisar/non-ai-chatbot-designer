import { useEffect, useState } from "react";
import { credentialsApi } from "../../../../../api/credentialsApi";
import { errorMessage } from "../../../../../api/http";
import { appConfig } from "../../../../../config";
import { CredentialsSelect } from "../../inspector/CredentialsSelect";
import { SelectField, TextField, VariableSelect } from "../../inspector/fields";
import { createId } from "../../state/createId";
import { type BlockEditorProps, option, withOptions } from "../blockHelpers";
import { COMPARISON_OPERATORS } from "./LogicEditors";

const ACTIONS = ["Get data from sheet", "Insert a row", "Update a row"] as const;
const TOTAL_ROWS = ["All", "First", "Last", "Random"] as const;

type Sheet = { id: string; name: string; columns: string[] };
type Cell = { id: string; column?: string; value?: string; variableId?: string };

/** Accepts a spreadsheet ID or its full URL. */
const spreadsheetIdFrom = (value: string) => value.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? value.trim();

export const GoogleSheetsEditor = ({ block, onChange }: BlockEditorProps) => {
  const credentialsId = option<string>(block, "credentialsId");
  const spreadsheetId = option<string>(block, "spreadsheetId");
  const action = option<(typeof ACTIONS)[number]>(block, "action");
  const [sheets, setSheets] = useState<Sheet[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!credentialsId || !spreadsheetId) return setSheets(undefined);
    let isCurrent = true;
    setError(undefined);
    credentialsApi
      .listSheets(appConfig.workspaceId, credentialsId, spreadsheetId)
      .then((list) => isCurrent && setSheets(list))
      .catch((err) => isCurrent && setError(errorMessage(err)));
    return () => {
      isCurrent = false;
    };
  }, [credentialsId, spreadsheetId]);

  const columns = sheets?.find((sheet) => sheet.id === option<string>(block, "sheetId"))?.columns ?? [];
  const set = (patch: Record<string, unknown>) => onChange(withOptions(block, patch));

  const cellList = (key: "cellsToInsert" | "cellsToUpsert" | "cellsToExtract", label: string, withValue: boolean) => {
    const cells = option<Cell[]>(block, key) ?? [];
    const update = (cellId: string, patch: Partial<Cell>) => set({ [key]: cells.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell)) });
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        {cells.map((cell) => (
          <div key={cell.id} className="list-field__block">
            <select className="select" value={cell.column ?? ""} onChange={(e) => update(cell.id, { column: e.target.value })}>
              <option value="">— column —</option>
              {columns.map((column) => (
                <option key={column}>{column}</option>
              ))}
            </select>
            {withValue ? (
              <input className="input" placeholder="Value or {{Variable}}" value={cell.value ?? ""} onChange={(e) => update(cell.id, { value: e.target.value })} />
            ) : (
              <VariableSelect label="Save in" value={cell.variableId} onChange={(variableId) => update(cell.id, { variableId })} />
            )}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ [key]: cells.filter((c) => c.id !== cell.id) })}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--sm" onClick={() => set({ [key]: [...cells, { id: createId() }] })}>
          Add
        </button>
      </div>
    );
  };

  const filter = option<{ comparisons?: Cell[] & { comparisonOperator?: string }[]; logicalOperator?: "AND" | "OR" }>(block, "filter") ?? {};
  const comparisons = (filter.comparisons ?? []) as { id: string; column?: string; comparisonOperator?: string; value?: string }[];
  const setComparisons = (next: typeof comparisons) => set({ filter: { logicalOperator: filter.logicalOperator ?? "AND", comparisons: next } });

  return (
    <>
      <CredentialsSelect type="google sheets" blockId={block.id} value={credentialsId} onChange={(id) => set({ credentialsId: id })} />
      <TextField label="Spreadsheet" placeholder="Spreadsheet URL or ID" value={spreadsheetId} onChange={(value) => set({ spreadsheetId: spreadsheetIdFrom(value) || undefined })} />
      {error && <p className="alert">{error}</p>}
      {sheets && (
        <SelectField label="Sheet" value={option<string>(block, "sheetId") ?? ""} options={[{ value: "", label: "— select —" }, ...sheets.map((sheet) => ({ value: sheet.id, label: sheet.name }))]} onChange={(sheetId) => set({ sheetId })} />
      )}
      <SelectField label="Action" value={action ?? ("" as never)} options={[{ value: "" as never, label: "— select —" }, ...ACTIONS.map((value) => ({ value, label: value }))]} onChange={(value) => set({ action: value })} />
      {action === "Insert a row" && cellList("cellsToInsert", "Cells to insert", true)}
      {(action === "Update a row" || action === "Get data from sheet") && (
        <div className="field">
          <span className="field__label">Rows matching</span>
          {comparisons.map((comparison) => (
            <div key={comparison.id} className="list-field__block">
              <select className="select" value={comparison.column ?? ""} onChange={(e) => setComparisons(comparisons.map((c) => (c.id === comparison.id ? { ...c, column: e.target.value } : c)))}>
                <option value="">— column —</option>
                {columns.map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
              <select
                className="select"
                value={comparison.comparisonOperator ?? "Equal to"}
                onChange={(e) => setComparisons(comparisons.map((c) => (c.id === comparison.id ? { ...c, comparisonOperator: e.target.value } : c)))}
              >
                {COMPARISON_OPERATORS.map((operator) => (
                  <option key={operator}>{operator}</option>
                ))}
              </select>
              <input className="input" placeholder="Value" value={comparison.value ?? ""} onChange={(e) => setComparisons(comparisons.map((c) => (c.id === comparison.id ? { ...c, value: e.target.value } : c)))} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setComparisons(comparisons.filter((c) => c.id !== comparison.id))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--sm" onClick={() => setComparisons([...comparisons, { id: createId(), comparisonOperator: "Equal to" }])}>
            Add filter
          </button>
          <span className="field__hint">No filter = every row.</span>
        </div>
      )}
      {action === "Update a row" && cellList("cellsToUpsert", "Cells to update", true)}
      {action === "Get data from sheet" && (
        <>
          <SelectField label="Rows to extract" value={option<(typeof TOTAL_ROWS)[number]>(block, "totalRowsToExtract") ?? "All"} options={TOTAL_ROWS.map((value) => ({ value, label: value }))} onChange={(totalRowsToExtract) => set({ totalRowsToExtract })} />
          {cellList("cellsToExtract", "Columns to save", false)}
        </>
      )}
    </>
  );
};
