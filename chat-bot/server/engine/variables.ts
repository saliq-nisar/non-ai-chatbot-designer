import type { RichTextNode, Variable } from "../../shared/types.js";

type VariableValue = Variable["value"];

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}|(\$)\{\{([^{}]+)\}\}/g;
const INLINE_CODE_PATTERN = /\{\{=(.+?)=\}\}/g;

export const valueToText = (value: VariableValue): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter((item) => item !== null).join(", ");
  return String(value);
};

/**
 * Replaces {{Variable name}} with the variable's value. Unknown or empty variables
 * become "". Inline code ({{= … =}}) is not executed and is removed.
 */
export const parseVariables = (text: string | undefined, variables: Variable[]): string => {
  if (!text) return "";
  return text
    .replace(INLINE_CODE_PATTERN, "")
    .replace(VARIABLE_PATTERN, (_match, name: string | undefined, dollar: string | undefined, templateName: string | undefined) => {
      const variable = variables.find((v) => v.name === (name ?? templateName) && v.value !== null && v.value !== undefined);
      return (dollar ?? "") + valueToText(variable?.value);
    });
};

/** Applies parseVariables to every string inside an object/array. */
export const deepParseVariables = <T>(input: T, variables: Variable[]): T => {
  if (typeof input === "string") return parseVariables(input, variables) as T;
  if (Array.isArray(input)) return input.map((item) => deepParseVariables(item, variables)) as T;
  if (input && typeof input === "object")
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, deepParseVariables(value, variables)])) as T;
  return input;
};

export const parseVariablesInRichText = (nodes: RichTextNode[], variables: Variable[]): RichTextNode[] =>
  nodes.map((node) => ({
    ...node,
    ...(node.text !== undefined ? { text: parseVariables(node.text, variables) } : {}),
    ...(node.url !== undefined ? { url: parseVariables(node.url, variables) } : {}),
    ...(node.children ? { children: parseVariablesInRichText(node.children, variables) } : {}),
  }));

export const findVariable = (variables: Variable[], id: string | undefined) =>
  id ? variables.find((variable) => variable.id === id) : undefined;

/** A value that is exactly one variable reference, e.g. "{{Email}}". */
export const singleVariableName = (text: string | undefined) => text?.trim().match(/^\{\{([^{}]+)\}\}$/)?.[1];

export const setVariableValues = (variables: Variable[], updates: { id: string; value: VariableValue }[]): Variable[] =>
  updates.length === 0
    ? variables
    : variables.map((variable) => {
        const update = updates.find((u) => u.id === variable.id);
        return update ? { ...variable, value: update.value } : variable;
      });

/** Prefilled variables are matched by variable name. */
export const applyPrefilledVariables = (variables: Variable[], prefilled: Record<string, unknown> | undefined): Variable[] => {
  if (!prefilled) return variables;
  return variables.map((variable) => {
    if (!(variable.name in prefilled)) return variable;
    const raw = prefilled[variable.name];
    const value = Array.isArray(raw) ? raw.map((item) => (item === null ? null : String(item))) : raw === null || raw === undefined ? null : String(raw);
    return { ...variable, value };
  });
};
