import { isIP } from "node:net";
import type { Block } from "../../shared/types.js";
import { config } from "../config.js";
import { collectedValues } from "../engine/state.js";
import type { Flow, IntegrationResult, SessionState } from "../engine/types.js";
import { parseVariables } from "../engine/variables.js";

/**
 * HTTP request block (also used by Zapier, Make.com and Pabbly blocks).
 * Options shape: { webhook: { url, method, headers[], queryParams[], body }, isCustomBody,
 * responseVariableMapping[{ bodyPath, variableId }], timeout }.
 */

type KeyValue = { key?: string; value?: string };
type Options = {
  webhook?: { url?: string; method?: string; headers?: KeyValue[]; queryParams?: KeyValue[]; body?: string };
  isCustomBody?: boolean;
  responseVariableMapping?: { bodyPath?: string; variableId?: string }[];
  timeout?: number;
};

const DEFAULT_TIMEOUT_S = 10;
const MAX_TIMEOUT_S = 120;
const BLOCKED_HOSTNAMES = new Set(["metadata.google.internal", "metadata.goog", "metadata"]);

const isPrivateAddress = (ip: string) => {
  if (isIP(ip) === 6) {
    const normalized = ip.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

/** Blocks requests to cloud metadata, private networks and (in production) localhost. */
export const assertSafeUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Protocol ${url.protocol} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("Cloud metadata addresses are not allowed");
  if (host === "localhost" && config.isProduction) throw new Error("localhost is not allowed");
  if (/^\d{8,10}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) throw new Error("Encoded IP addresses are not allowed");
  if (isIP(host) && isPrivateAddress(host) && config.isProduction) throw new Error("Private network addresses are not allowed");
};

const toObject = (pairs: KeyValue[] | undefined, variables: Flow["variables"]) => {
  const result: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const key = parseVariables(pair.key, variables);
    const value = parseVariables(pair.value, variables);
    if (key && value) result[key] = value;
  }
  return result;
};

/** Reads a value from the response with paths like `data.user.name`, `data.items[0].id` or `statusCode`. */
export const readPath = (source: unknown, path: string): unknown => {
  const parts = path.trim().replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const toVariableValue = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((item) => (item === null || item === undefined ? null : typeof item === "object" ? JSON.stringify(item) : String(item)));
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const parseJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const runHttpRequest = async (block: Block, { state, flow }: { state: SessionState; flow: Flow }): Promise<IntegrationResult> => {
  const options = (block.options ?? {}) as Options;
  const request = options.webhook;
  if (!request?.url) return {};
  const { variables } = flow;

  const method = (request.method ?? "POST").toUpperCase();
  const query = new URLSearchParams(toObject(request.queryParams, variables)).toString();
  const url = parseVariables(request.url, variables) + (query ? `${request.url.includes("?") ? "&" : "?"}${query}` : "");
  const headers = toObject(request.headers, variables);

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (options.isCustomBody && request.body && request.body !== "{{state}}") {
      // Inside JSON, text values are escaped so the body stays valid JSON.
      const isSingleVariable = /^\{\{[^{}]+\}\}$/.test(request.body.trim());
      body = isSingleVariable
        ? parseVariables(request.body, variables)
        : request.body.replace(/\{\{([^{}]+)\}\}/g, (match) => JSON.stringify(parseVariables(match, variables)).slice(1, -1));
    } else {
      body = JSON.stringify(collectedValues(state));
    }
    const lowerHeaderNames = Object.keys(headers).map((name) => name.toLowerCase());
    if (!lowerHeaderNames.includes("content-type")) headers["Content-Type"] = typeof parseJson(body) === "object" ? "application/json" : "text/plain";
    if (headers["Content-Type"]?.includes("x-www-form-urlencoded")) {
      const parsed = parseJson(body);
      if (parsed && typeof parsed === "object") body = new URLSearchParams(Object.entries(parsed).map(([k, v]): [string, string] => [k, String(v)])).toString();
    }
  }

  const timeoutSeconds = Math.min(options.timeout ?? DEFAULT_TIMEOUT_S, MAX_TIMEOUT_S);
  let response: { statusCode: number; data: unknown };
  try {
    assertSafeUrl(url);
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutSeconds * 1000) });
    response = { statusCode: res.status, data: parseJson(await res.text()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      logs: [{ status: "error", description: `HTTP request failed: ${message}`, details: JSON.stringify({ url, method }) }],
      variables: mapResponse(options, { statusCode: error instanceof DOMException && error.name === "TimeoutError" ? 408 : 500, data: { message } }, flow),
    };
  }

  const isError = response.statusCode >= 400;
  return {
    variables: mapResponse(options, response, flow),
    logs: [{ status: isError ? "error" : "success", description: isError ? "HTTP request returned an error" : "HTTP request executed", details: JSON.stringify({ url, method, statusCode: response.statusCode }) }],
  };
};

const mapResponse = (options: Options, response: { statusCode: number; data: unknown }, flow: Flow) =>
  (options.responseVariableMapping ?? [])
    .filter((mapping) => mapping.bodyPath && mapping.variableId && flow.variables.some((v) => v.id === mapping.variableId))
    .map((mapping) => ({ id: mapping.variableId!, value: toVariableValue(readPath(response, parseVariables(mapping.bodyPath, flow.variables))) }));
