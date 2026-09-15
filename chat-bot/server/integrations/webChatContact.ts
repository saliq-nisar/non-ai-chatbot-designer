import { config } from "../config.js";

/**
 * When a Web Chat conversation starts, POST { ip, publicId } to SAVE_WEBCHAT_CONTACT_URL.
 * The JSON object it returns is used as prefilled variables (matched by variable name).
 * Any failure is logged and the chat starts anyway.
 */
export const saveWebChatContact = async ({ ip, publicId }: { ip: string | undefined; publicId: string }): Promise<Record<string, unknown>> => {
  if (!config.saveWebChatContactUrl) return {};
  try {
    const response = await fetch(config.saveWebChatContactUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: ip ?? "", publicId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("[webChatContact] responded with status", response.status);
      return {};
    }
    const data = (await response.json()) as unknown;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch (error) {
    console.error("[webChatContact] failed:", error instanceof Error ? error.message : error);
    return {};
  }
};
