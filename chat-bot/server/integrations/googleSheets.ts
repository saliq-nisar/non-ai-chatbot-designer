import type { Block, Variable } from "../../shared/types.js";
import { type Condition, executeCondition } from "../engine/conditions.js";
import type { Flow, IntegrationResult, SessionState } from "../engine/types.js";
import { deepParseVariables } from "../engine/variables.js";
import { getGoogleAccessToken } from "./googleAuth.js";

/**
 * Google Sheets block: "Get data from sheet", "Insert a row", "Update a row".
 * The first row of the sheet holds the column names. Uses the Sheets REST API.
 */

type Cell = { column?: string; value?: string };
type Options = {
  credentialsId?: string;
  spreadsheetId?: string;
  sheetId?: string;
  action?: "Get data from sheet" | "Insert a row" | "Update a row";
  cellsToInsert?: Cell[];
  cellsToUpsert?: Cell[];
  cellsToExtract?: { column?: string; variableId?: string }[];
  referenceCell?: Cell;
  filter?: { comparisons?: { column?: string; comparisonOperator?: string; value?: string }[]; logicalOperator?: "AND" | "OR" };
  totalRowsToExtract?: "All" | "First" | "Last" | "Random";
};

const API = "https://sheets.googleapis.com/v4/spreadsheets";

const googleFetch = async <T>(accessToken: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `Google Sheets responded ${response.status}`);
  return data;
};

/** Sheets of a spreadsheet with their column names (used by the builder). */
export const listSheets = async (accessToken: string, spreadsheetId: string) => {
  const { sheets } = await googleFetch<{ sheets: { properties: { sheetId: number; title: string } }[] }>(
    accessToken,
    `${API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
  );
  return Promise.all(
    sheets.map(async ({ properties }) => {
      const { values } = await googleFetch<{ values?: string[][] }>(accessToken, `${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${properties.title}'!1:1`)}`);
      return { id: String(properties.sheetId), name: properties.title, columns: values?.[0] ?? [] };
    }),
  );
};

const columnLetter = (index: number) => {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
};

/** A row matches when its cells satisfy the filter (same operators as Condition blocks). */
const rowMatches = (row: Record<string, string>, options: Options) => {
  if (options.referenceCell?.column) return row[options.referenceCell.column] === options.referenceCell.value;
  const comparisons = options.filter?.comparisons ?? [];
  if (comparisons.length === 0) return true;
  const cells: Variable[] = Object.entries(row).map(([column, value]) => ({ id: column, name: column, value }));
  const condition: Condition = {
    logicalOperator: options.filter?.logicalOperator,
    comparisons: comparisons.map((comparison, index) => ({ id: String(index), variableId: comparison.column, comparisonOperator: comparison.comparisonOperator, value: comparison.value })),
  };
  return executeCondition(condition, cells);
};

export const runGoogleSheets = async (block: Block, { state, flow }: { state: SessionState; flow: Flow }): Promise<IntegrationResult> => {
  const options = deepParseVariables((block.options ?? {}) as Options, flow.variables);
  if (!options.credentialsId || !options.spreadsheetId || !options.sheetId || !options.action) return {};
  try {
    const accessToken = await getGoogleAccessToken("google sheets", options.credentialsId, state.workspaceId);
    const sheets = await googleFetch<{ sheets: { properties: { sheetId: number; title: string } }[] }>(
      accessToken,
      `${API}/${encodeURIComponent(options.spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
    );
    const title = sheets.sheets.find((sheet) => String(sheet.properties.sheetId) === options.sheetId)?.properties.title;
    if (!title) throw new Error("Sheet not found");
    const range = (a1: string) => `${API}/${encodeURIComponent(options.spreadsheetId!)}/values/${encodeURIComponent(`'${title}'${a1}`)}`;
    const { values = [] } = await googleFetch<{ values?: string[][] }>(accessToken, range(""));
    const header = values[0] ?? [];
    const rows = values.slice(1).map((cells) => Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""])));

    if (options.action === "Insert a row") {
      const byColumn = Object.fromEntries((options.cellsToInsert ?? []).filter((cell) => cell.column).map((cell) => [cell.column!, cell.value ?? ""]));
      await googleFetch(accessToken, `${range("")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        body: { values: [header.map((column) => byColumn[column] ?? "")] },
      });
      return { logs: [{ status: "success", description: `Inserted a row in ${title}` }] };
    }

    const matching = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => rowMatches(row, options));

    if (options.action === "Update a row") {
      if (matching.length === 0) return { logs: [{ status: "info", description: "No rows matched the filter" }] };
      const data = matching.flatMap(({ rowNumber }) =>
        (options.cellsToUpsert ?? [])
          .filter((cell) => cell.column && header.includes(cell.column))
          .map((cell) => ({ range: `'${title}'!${columnLetter(header.indexOf(cell.column!))}${rowNumber}`, values: [[cell.value ?? ""]] })),
      );
      await googleFetch(accessToken, `${API}/${encodeURIComponent(options.spreadsheetId)}/values:batchUpdate`, { method: "POST", body: { valueInputOption: "USER_ENTERED", data } });
      return { logs: [{ status: "success", description: `Updated ${matching.length} row(s) in ${title}` }] };
    }

    // Get data from sheet
    let selected = matching.map(({ row }) => row);
    if (options.totalRowsToExtract === "First") selected = selected.slice(0, 1);
    else if (options.totalRowsToExtract === "Last") selected = selected.slice(-1);
    else if (options.totalRowsToExtract === "Random" && selected.length) selected = [selected[Math.floor(Math.random() * selected.length)]!];
    if (selected.length === 0) return { logs: [{ status: "info", description: "No rows matched the filter" }] };
    const variables = (options.cellsToExtract ?? [])
      .filter((cell) => cell.column && cell.variableId && flow.variables.some((v) => v.id === cell.variableId))
      .map((cell) => {
        const values = selected.map((row) => row[cell.column!] ?? null);
        return { id: cell.variableId!, value: values.length === 1 ? values[0]! : values };
      });
    return { variables };
  } catch (error) {
    return { logs: [{ status: "error", description: `Google Sheets: ${error instanceof Error ? error.message : String(error)}` }] };
  }
};
