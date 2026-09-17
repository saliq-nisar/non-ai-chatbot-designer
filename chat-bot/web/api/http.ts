import { appConfig } from "../config";

/** Embedded builder: the signed embed token authorizes API calls (third-party iframes get no cookies). */
export const authHeaders = (): Record<string, string> => (appConfig.embedToken ? { "X-Chat-Bot-Embed-Token": appConfig.embedToken } : {});

/**
 * The one place HTTP requests are made. Handles JSON, timeouts, cancellation,
 * error normalization and de-duplication of identical in-flight GET requests.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 for network errors / timeouts. */
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const inFlightGets = new Map<string, Promise<unknown>>();

export const request = <T>(url: string, options: RequestOptions = {}): Promise<T> => {
  const method = options.method ?? "GET";
  if (method !== "GET" || options.signal) return send<T>(url, options);

  // Two components asking for the same resource at the same time share one request.
  const existing = inFlightGets.get(url);
  if (existing) return existing as Promise<T>;
  const promise = send<T>(url, options).finally(() => inFlightGets.delete(url));
  inFlightGets.set(url, promise);
  return promise;
};

const send = async <T>(url: string, { method = "GET", body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...authHeaders(), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled by the caller: let it propagate as AbortError
    throw new ApiError(timeout.aborted ? "The request timed out" : "Network error — check your connection", 0);
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(`Invalid response from server (${response.status})`, response.status);
  }

  if (!response.ok) {
    if (response.status === 401 && url.startsWith("/api/v1/") && appConfig.embedToken) {
      throw new ApiError("Your editing session has expired. Reload the page to continue.", 401);
    }
    if (response.status === 401 && url.startsWith("/api/v1/")) {
      window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiError(readErrorMessage(data) ?? `Request failed (${response.status})`, response.status);
  }
  return data as T;
};

const readErrorMessage = (data: unknown) =>
  data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : undefined;

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");
