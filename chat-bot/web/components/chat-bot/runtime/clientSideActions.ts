import type { ChatContext } from "../../../api/chatApi";
import type { ClientSideAction } from "../../../api/types";
import { sleep } from "./timing";

/**
 * Client-side actions returned by the chat API:
 *  - "wait", "redirect"
 *  - "scriptToExecute": Code blocks, Google Analytics, Meta Pixel, Chatwoot. Scripts marked
 *    `shouldExecuteInParentContext` run on the website hosting the Web Chat (the Web Chat
 *    script receives them); otherwise, or on the standalone chat page, they run here.
 * Unknown actions are skipped; when the backend expects a dedicated reply, the session still
 * continues the chat so the flow never gets stuck.
 */

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;

export const runScript = async ({ content, args }: { content: string; args: { id: string; value: unknown }[] }) => {
  const code = content.replace(/<\/?script>/g, "");
  await new AsyncFunction(...args.map((arg) => arg.id), code)(...args.map((arg) => arg.value));
};

export const executeClientSideAction = async (action: ClientSideAction, { signal, context }: { signal: AbortSignal; context: ChatContext }): Promise<void> => {
  switch (action.type) {
    case "wait":
      await sleep((action.wait?.secondsToWaitFor ?? 0) * 1000, signal);
      return;
    case "redirect": {
      const url = action.redirect?.url;
      if (!url || !/^https?:\/\//i.test(url)) return;
      // "_top" also leaves the Web Chat iframe and navigates the host page.
      window.open(url, action.redirect?.isNewTab ? "_blank" : "_top", "noopener");
      return;
    }
    case "scriptToExecute": {
      if (!action.scriptToExecute) return;
      if (action.shouldExecuteInParentContext && context.embedOrigin && window.parent !== window) {
        window.parent.postMessage({ type: "chat-bot:execute", script: action.scriptToExecute }, context.embedOrigin);
        return;
      }
      await runScript(action.scriptToExecute);
      return;
    }
    default:
      return;
  }
};
