import type { Variable } from "../../shared/types.js";
import { parseVariables, singleVariableName } from "./variables.js";

/** Condition evaluation — same operators and semantics as the previous engine. */

export type Comparison = { id?: string; variableId?: string; comparisonOperator?: string; value?: string };
export type Condition = { logicalOperator?: "AND" | "OR"; comparisons?: Comparison[] };

type Value = string | (string | null)[] | null;

const normalize = (text: string) => text.toLowerCase().trim().normalize();

/** Number, then date, then string length — used by greater/less comparisons. */
const toComparable = (value: string) => {
  const number = value.startsWith("+") ? NaN : Number(value);
  if (!Number.isNaN(number)) return number;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value.length : time;
};

const compare = (test: (a: string | null, b: string | null) => boolean, a: Value, b: Value, mode: "every" | "some" = "every"): boolean => {
  if (!Array.isArray(a)) {
    if (!Array.isArray(b)) return test(a, b);
    return mode === "every" ? b.every((item) => test(a, item)) : b.some((item) => test(a, item));
  }
  if (!Array.isArray(b)) return mode === "every" ? a.every((item) => test(item, b)) : a.some((item) => test(item, b));
  return mode === "every" ? a.every((x) => b.every((y) => test(x, y))) : a.some((x) => b.some((y) => test(x, y)));
};

const toRegExp = (source: string) => {
  const withFlags = source.match(/\/(.+)\/([gimuy]*)$/);
  try {
    return withFlags ? new RegExp(withFlags[1]!, withFlags[2]) : new RegExp(source);
  } catch {
    return undefined;
  }
};

const numericCompare = (a: Value, b: Value, test: (x: number, y: number) => boolean) => {
  if (a === null || b === null) return false;
  const left = typeof a === "string" ? toComparable(a) : a.length;
  const right = typeof b === "string" ? (typeof a === "string" ? toComparable(b) : Number(b)) : b.length;
  return test(left, right);
};

const executeComparison = (comparison: Comparison, variables: Variable[]): boolean => {
  if (!comparison.variableId || !comparison.comparisonOperator) return false;
  const input = (variables.find((v) => v.id === comparison.variableId)?.value ?? null) as Value;
  const referenced = singleVariableName(comparison.value);
  const expected: Value =
    comparison.value === "undefined" || comparison.value === "null"
      ? null
      : referenced
        ? ((variables.find((v) => v.name === referenced)?.value ?? null) as Value)
        : parseVariables(comparison.value, variables);

  switch (comparison.comparisonOperator) {
    case "Contains":
      if (Array.isArray(input)) return compare((a, b) => a === b || (!!a && !!b && a.normalize() === b.normalize()), input, expected, "some");
      return compare((a, b) => !!a && !!b && normalize(a).includes(normalize(b)), input, expected, "some");
    case "Does not contain":
      if (Array.isArray(input)) return compare((a, b) => (a && b ? a.normalize() !== b.normalize() : a !== b), input, expected);
      return compare((a, b) => !a || !b || !normalize(a).includes(normalize(b)), input, expected);
    case "Equal to":
      return compare((a, b) => (a !== null && b !== null ? a.normalize() === b.normalize() : a === b), input, expected);
    case "Not equal":
      return compare((a, b) => (a !== null && b !== null ? a.normalize() !== b.normalize() : a !== b), input, expected);
    case "Greater than":
      return numericCompare(input, expected, (x, y) => x > y);
    case "Less than":
      return numericCompare(input, expected, (x, y) => x < y);
    case "Greater or equal to":
      return numericCompare(input, expected, (x, y) => x >= y);
    case "Less or equal to":
      return numericCompare(input, expected, (x, y) => x <= y);
    case "Is set":
      return input !== null && input.length > 0;
    case "Is empty":
      return input === null || input.length === 0;
    case "Starts with":
      return compare((a, b) => !!a && !!b && normalize(a).startsWith(normalize(b)), input, expected);
    case "Ends with":
      return compare((a, b) => !!a && !!b && normalize(a).endsWith(normalize(b)), input, expected);
    case "Matches regex":
      return compare((a, b) => !!a && !!b && (toRegExp(b)?.test(a) ?? false), input, expected, "some");
    case "Does not match regex":
      return compare((a, b) => !!a && !!b && !(toRegExp(b)?.test(a) ?? false), input, expected);
    default:
      return false;
  }
};

export const executeCondition = (condition: Condition | undefined, variables: Variable[]): boolean => {
  const comparisons = condition?.comparisons ?? [];
  if (comparisons.length === 0) return false;
  return (condition?.logicalOperator ?? "AND") === "AND"
    ? comparisons.every((comparison) => executeComparison(comparison, variables))
    : comparisons.some((comparison) => executeComparison(comparison, variables));
};
