import { createId } from "../../shared/createId.js";
import type { Block, ClientSideAction, Variable } from "../../shared/types.js";
import { type Condition, executeCondition } from "./conditions.js";
import type { Flow, SessionState, VariableUpdate } from "./types.js";
import { deepParseVariables, findVariable, parseVariables, singleVariableName } from "./variables.js";

/**
 * Logic blocks and browser-side integration blocks (no network or database here).
 * Each returns what changes:
 *  - `variables`: variable updates
 *  - `clientSideActions`: actions for the chat UI (wait, redirect, code, analytics…)
 *  - `jump`: where the path goes now; no `jump` = continue with the next block
 */
export type LogicResult = {
  variables?: VariableUpdate[];
  clientSideActions?: ClientSideAction[];
  jump?:
    | { edgeId: string }
    | { groupId: string; blockId?: string; setReturnPoint?: boolean }
    | { linkChatBotId: string; groupId?: string; mergeVariables: boolean }
    | "return"
    | "end";
};

export const LOGIC_TYPES = new Set([
  "Set variable",
  "Condition",
  "Redirect",
  "Wait",
  "Jump",
  "AB test",
  "Code",
  "Typebot link",
  "Return",
  "Google Analytics",
  "Pixel",
  "Chatwoot",
]);

const option = <T>(block: Block, key: string) => block.options?.[key] as T | undefined;

/**
 * "Custom" values: a single {{variable}} keeps its value (lists included); arithmetic on
 * numbers is calculated (e.g. {{Score}} + 1); quoted text is unquoted; anything else is
 * stored as text with variables filled in. No code is executed on the server.
 */
const evaluateCustomValue = (expression: string | undefined, variables: Variable[]): Variable["value"] => {
  if (!expression) return null;
  const referenced = singleVariableName(expression);
  if (referenced) return variables.find((variable) => variable.name === referenced)?.value ?? null;
  const text = parseVariables(expression, variables).trim();
  if (/\d/.test(text) && /^[\d\s.+\-*/%()]+$/.test(text)) {
    try {
      const result = new Function(`"use strict"; return (${text});`)() as unknown;
      if (typeof result === "number" && Number.isFinite(result)) return String(result);
    } catch {
      // not a valid arithmetic expression: keep it as text
    }
  }
  const quoted = text.match(/^(["'`])([\s\S]*)\1$/);
  return quoted ? quoted[2]! : text;
};

const momentOfTheDay = (hour: number) => (hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : hour >= 18 && hour < 22 ? "evening" : "night");

const setVariableValue = (block: Block, state: SessionState, variables: Variable[]): Variable["value"] | undefined => {
  const now = Date.now();
  switch (option<string>(block, "type") ?? "Custom") {
    case "Custom":
      return evaluateCustomValue(option<string>(block, "expressionToEvaluate"), variables);
    case "Empty":
      return null;
    case "Now":
    case "Today":
      return new Date(now).toISOString();
    case "Yesterday":
      return new Date(now - 86_400_000).toISOString();
    case "Tomorrow":
      return new Date(now + 86_400_000).toISOString();
    case "Random ID":
      return createId();
    case "Result ID":
    case "User ID":
      return state.resultId ?? createId();
    case "Environment name":
      return "web";
    case "Moment of the day":
      return momentOfTheDay(new Date(now).getHours());
    case "Transcript":
      return state.transcript.map((line) => `${line.role === "bot" ? "Bot" : "User"}: ${line.text}`).join("\n");
    case "Append value(s)": {
      const current = findVariable(variables, option<string>(block, "variableId"))?.value;
      const list = Array.isArray(current) ? current : current ? [current] : [];
      return [...list, parseVariables(option<string>(block, "item"), variables)];
    }
    case "Pop":
    case "Shift": {
      const current = findVariable(variables, option<string>(block, "variableId"))?.value;
      if (!Array.isArray(current)) return undefined;
      return option<string>(block, "type") === "Pop" ? current.slice(0, -1) : current.slice(1);
    }
    default:
      return undefined; // unsupported type: leave the variable unchanged
  }
};

/** Code for the browser: {{Variable}} references become function arguments. */
const toScript = (content: string, variables: Variable[]) => {
  const used = variables.filter((variable) => content.includes(`{{${variable.name}}}`));
  let code = content;
  for (const variable of used) code = code.split(`{{${variable.name}}}`).join(variable.id);
  return { content: code, args: used.map((variable) => ({ id: variable.id, value: variable.value ?? null })) };
};

const CHATWOOT_DEFAULT_URL = "https://app.chatwoot.com";

const chatwootScript = (block: Block, variables: Variable[], resultId: string | undefined) => {
  const options = deepParseVariables(block.options ?? {}, variables) as {
    task?: string;
    baseUrl?: string;
    websiteToken?: string;
    user?: { id?: string; email?: string; name?: string; avatarUrl?: string; phoneNumber?: string };
  };
  if (options.task === "Close widget") return `if (window.$chatwoot) { window.$chatwoot.toggle("close"); window.$chatwoot.toggleBubbleVisibility("hide"); }`;
  const user = options.user;
  const setUser =
    user?.email || user?.id
      ? `window.$chatwoot.setUser(${JSON.stringify(user.id || user.email || resultId)}, ${JSON.stringify({
          email: user.email,
          name: user.name,
          avatar_url: user.avatarUrl,
          phone_number: user.phoneNumber,
        })});`
      : "";
  const open = `${setUser} window.$chatwoot.toggle("open");`;
  return `if (window.$chatwoot) { ${open} } else { (function (d, t) {
  var BASE_URL = ${JSON.stringify(options.baseUrl || CHATWOOT_DEFAULT_URL)};
  var g = d.createElement(t), s = d.getElementsByTagName(t)[0];
  g.src = BASE_URL + "/packs/js/sdk.js"; g.defer = true; g.async = true; s.parentNode.insertBefore(g, s);
  g.onload = function () {
    window.chatwootSDK.run({ websiteToken: ${JSON.stringify(options.websiteToken ?? "")}, baseUrl: BASE_URL });
    window.addEventListener("chatwoot:ready", function () { ${open} });
  };
})(document, "script"); }`;
};

/** Analytics and support widgets run on the website hosting the Web Chat (or the chat page itself). */
const hostPageScript = (content: string): ClientSideAction => ({ type: "scriptToExecute", scriptToExecute: { content, args: [] }, shouldExecuteInParentContext: true });

const googleAnalyticsScript = (block: Block, variables: Variable[]) => {
  const options = deepParseVariables(block.options ?? {}, variables) as { trackingId?: string; category?: string; action?: string; label?: string; value?: string | number; sendTo?: string };
  if (!options.trackingId) return undefined;
  const event = {
    event_category: options.category || undefined,
    event_label: options.label || undefined,
    value: options.value === undefined || options.value === "" ? undefined : Number(options.value),
    send_to: options.sendTo || undefined,
  };
  return `var id = ${JSON.stringify(options.trackingId)};
var send = function () { window.gtag("event", ${JSON.stringify(options.action ?? "")}, ${JSON.stringify(event)}); };
if (window.gtag) return send();
window.dataLayer = window.dataLayer || [];
window.gtag = function () { window.dataLayer.push(arguments); };
window.gtag("js", new Date()); window.gtag("config", id);
var script = document.createElement("script"); script.async = true;
script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
document.head.appendChild(script); send();`;
};

const pixelScript = (block: Block, variables: Variable[]) => {
  const options = deepParseVariables(block.options ?? {}, variables) as { pixelId?: string; isInitSkip?: boolean; eventType?: string; name?: string; params?: { key?: string; value?: unknown }[] };
  if (!options.pixelId) return undefined;
  const params = Object.fromEntries((options.params ?? []).filter((p) => p.key && p.value !== undefined && p.value !== "").map((p) => [p.key!, p.value]));
  const track =
    options.eventType === "Custom"
      ? options.name
        ? `fbq("trackSingleCustom", id, ${JSON.stringify(options.name)}, ${JSON.stringify(params)});`
        : ""
      : options.eventType
        ? `fbq("trackSingle", id, ${JSON.stringify(options.eventType)}, ${JSON.stringify(params)});`
        : "";
  return `var id = ${JSON.stringify(options.pixelId)};
if (!window.fbq) { !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js'); }
${options.isInitSkip ? "" : 'fbq("init", id); fbq("track", "PageView");'}
${track}`;
};

export const executeLogic = (block: Block, state: SessionState, flow: Flow): LogicResult => {
  const { variables } = flow;
  switch (block.type) {
    case "Set variable": {
      const variableId = option<string>(block, "variableId");
      if (!findVariable(variables, variableId)) return {};
      const value = setVariableValue(block, state, variables);
      return value === undefined ? {} : { variables: [{ id: variableId!, value }] };
    }

    case "Condition": {
      const passed = block.items?.find((item) => executeCondition(item.content as Condition | undefined, variables));
      if (passed) return { jump: passed.outgoingEdgeId ? { edgeId: passed.outgoingEdgeId } : "end" };
      return block.outgoingEdgeId ? { jump: { edgeId: block.outgoingEdgeId } } : {};
    }

    case "AB test": {
      const aPercent = option<number>(block, "aPercent") ?? 50;
      const item = block.items?.[Math.random() * 100 < aPercent ? 0 : 1];
      return item?.outgoingEdgeId ? { jump: { edgeId: item.outgoingEdgeId } } : {};
    }

    case "Redirect": {
      const url = parseVariables(option<string>(block, "url"), variables);
      if (!url) return {};
      return { clientSideActions: [{ type: "redirect", redirect: { url, isNewTab: option<boolean>(block, "isNewTab") } }] };
    }

    case "Wait": {
      const seconds = Number.parseFloat(parseVariables(option<string>(block, "secondsToWaitFor"), variables));
      const shouldPause = option<boolean>(block, "shouldPause") === true;
      if (!seconds && !shouldPause) return {};
      return {
        clientSideActions: [{ type: "wait", wait: { secondsToWaitFor: Number.isNaN(seconds) ? 0 : seconds }, expectsDedicatedReply: shouldPause || undefined }],
      };
    }

    case "Jump": {
      const groupIdOrTitle = option<string>(block, "groupId");
      if (!groupIdOrTitle) return {};
      const title = singleVariableName(groupIdOrTitle) ? parseVariables(groupIdOrTitle, variables) : undefined;
      const group = flow.groups.find((g) => (title ? g.title === title : g.id === groupIdOrTitle));
      if (!group) return { jump: "end" };
      return { jump: { groupId: group.id, blockId: option<string>(block, "blockId"), setReturnPoint: true } };
    }

    case "Return":
      return { jump: "return" };

    case "Typebot link": {
      const linked = option<string>(block, "typebotId");
      if (!linked) return {};
      const chatBotId = linked === "current" ? flow.chatBotId : linked;
      return { jump: { linkChatBotId: chatBotId, groupId: option<string>(block, "groupId"), mergeVariables: option<boolean>(block, "mergeResults") === true } };
    }

    case "Code": {
      const content = option<string>(block, "content");
      if (!content) return {};
      return {
        clientSideActions: [
          {
            type: "scriptToExecute",
            scriptToExecute: toScript(content, variables),
            shouldExecuteInParentContext: option<boolean>(block, "shouldExecuteInParentContext") === true,
          },
        ],
      };
    }

    case "Google Analytics": {
      const script = googleAnalyticsScript(block, variables);
      return script ? { clientSideActions: [hostPageScript(script)] } : {};
    }

    case "Pixel": {
      const script = pixelScript(block, variables);
      return script ? { clientSideActions: [hostPageScript(script)] } : {};
    }

    case "Chatwoot":
      return { clientSideActions: [hostPageScript(chatwootScript(block, variables, state.resultId))] };

    default:
      return {};
  }
};
