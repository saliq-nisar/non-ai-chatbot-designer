import type { Variable } from "../../shared/types.js";
import type { Flow, SessionState, VariableUpdate } from "./types.js";
import { setVariableValues } from "./variables.js";

/** Small immutable helpers around the session state. */

export const currentFlow = (state: SessionState): Flow => state.flows[state.currentFlowId]!;

export const rootFlow = (state: SessionState): Flow => state.flows[state.rootFlowId]!;

export const replaceFlow = (state: SessionState, flow: Flow): SessionState => ({
  ...state,
  flows: { ...state.flows, [flow.chatBotId]: flow },
});

export const updateVariables = (state: SessionState, updates: VariableUpdate[], flowId = state.currentFlowId): SessionState => {
  if (updates.length === 0) return state;
  const flow = state.flows[flowId]!;
  return replaceFlow(state, { ...flow, variables: setVariableValues(flow.variables, updates) });
};

/** Copies values of same-name variables from one flow into another. */
export const copyVariablesByName = (from: Variable[], to: Variable[]): Variable[] =>
  to.map((variable) => {
    const source = from.find((v) => v.name === variable.name && v.value !== null && v.value !== undefined);
    return source ? { ...variable, value: source.value } : variable;
  });

const MAX_TRANSCRIPT_LINES = 200;

export const addTranscript = (state: SessionState, role: "bot" | "user", text: string): SessionState => ({
  ...state,
  transcript: [...state.transcript, { role, text }].slice(-MAX_TRANSCRIPT_LINES),
});

/** Answers and variables as one object: default body of HTTP requests and emails. */
export const collectedValues = (state: SessionState): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const variable of rootFlow(state).variables) {
    if (variable.value === null || variable.value === undefined) continue;
    values[variable.name] = Array.isArray(variable.value) ? variable.value.filter((v) => v !== null).join(", ") : String(variable.value);
  }
  for (const answer of state.answers) values[answer.key] = answer.value;
  return values;
};
