import type { Block, ChatBotEvent, ChatBubble } from "../../shared/types.js";
import { BUBBLE_TYPES, bubbleToText, toChatBubble } from "./bubbles.js";
import { formatInput, INPUT_TYPES, type ParsedReply, retryMessage, validateReply } from "./inputs.js";
import { executeLogic, LOGIC_TYPES } from "./logic.js";
import { addTranscript, copyVariablesByName, currentFlow, replaceFlow, updateVariables } from "./state.js";
import type { EngineServices, Flow, SessionState, StepResult, Target } from "./types.js";

/**
 * The flow engine. Takes a session state, returns the next state and what to send to
 * the chat UI. Network/database work (integration blocks, payment intents) is done by
 * the injected `services`, so this file has no I/O of its own.
 *
 *   startFlow(state)                 run from the start event until an input (or the end)
 *   continueFlow(state, reply)       handle the reply to the current input, then run on
 *
 * Execution rules:
 *  - blocks of a group run in order; bubbles are collected; an input stops the run
 *  - the last block's outgoing edge leads to the next group
 *  - logic blocks can redirect the path (condition, jump/return, A/B test, chat bot link)
 *  - when a path ends, the latest "continuation" resumes (after a reply/command event,
 *    or back in the parent chat bot after a linked one finished)
 */

export const INTEGRATION_TYPES = new Set(["Webhook", "Zapier", "Make.com", "Pabbly", "Email", "Google Sheets", "gmail"]);

const MAX_GROUPS_PER_STEP = 500; // protects against flows that loop without asking anything

/** Reply "input type" names given to reply events (same values as before). */
const INPUT_TYPE_NAMES: Record<string, string> = {
  "text input": "text",
  "number input": "number",
  "email input": "email",
  "url input": "url",
  "date input": "date",
  "time input": "time",
  "phone number input": "phone",
  "choice input": "buttons",
  "picture choice input": "picture choice",
  "payment input": "payment",
  "rating input": "rating",
  "file input": "file",
  cards: "cards",
};

const findBlock = (flow: Flow, blockId: string) => {
  for (const group of flow.groups) {
    const index = group.blocks.findIndex((block) => block.id === blockId);
    if (index !== -1) return { group, block: group.blocks[index]!, index };
  }
  return undefined;
};

const targetOfEdge = (flow: Flow, edgeId: string | undefined): Target | undefined => {
  const edge = edgeId ? flow.edges.find((e) => e.id === edgeId) : undefined;
  const group = edge ? flow.groups.find((g) => g.id === edge.to.groupId) : undefined;
  if (!edge || !group) return undefined;
  const blockIndex = edge.to.blockId ? group.blocks.findIndex((block) => block.id === edge.to.blockId) : 0;
  return { groupId: group.id, blockIndex: Math.max(blockIndex, 0) };
};

const groupTarget = (flow: Flow, groupId: string, blockId?: string): Target | undefined => {
  const group = flow.groups.find((g) => g.id === groupId);
  if (!group) return undefined;
  const blockIndex = blockId ? group.blocks.findIndex((block) => block.id === blockId) : 0;
  return { groupId, blockIndex: Math.max(blockIndex, 0) };
};

/** Where the flow continues after the block at `index` (next block, or the group's outgoing edge). */
const afterBlock = (flow: Flow, groupId: string, index: number): Target | undefined => {
  const group = flow.groups.find((g) => g.id === groupId)!;
  if (index < group.blocks.length - 1) return { groupId, blockIndex: index + 1 };
  return targetOfEdge(flow, group.blocks[index]!.outgoingEdgeId);
};

const startTarget = (flow: Flow) => targetOfEdge(flow, flow.events.find((event) => event.type === "start")?.outgoingEdgeId);

const findEvent = (flow: Flow, type: string, match?: (event: ChatBotEvent) => boolean) =>
  flow.events.find((event) => event.type === type && !!event.outgoingEdgeId && (!match || match(event)));

const emptyResult = (state: SessionState): StepResult => ({ state, messages: [], clientSideActions: [], answers: [], logs: [] });

const run = async (initialState: SessionState, start: Target | undefined, result: StepResult, services: EngineServices): Promise<StepResult> => {
  let state = initialState;
  let target = start;
  let lastBubbleBlockId: string | undefined;
  let visitedGroups = 0;

  for (;;) {
    if (!target) {
      // The path ended: resume where an event or a linked chat bot was started from.
      const continuation = state.continuations.at(-1);
      if (!continuation) break;
      const finishedFlow = currentFlow(state);
      state = { ...state, continuations: state.continuations.slice(0, -1), currentFlowId: continuation.flowId };
      if (continuation.mergeVariablesFromFlowId) {
        const parent = currentFlow(state);
        state = replaceFlow(state, { ...parent, variables: copyVariablesByName(finishedFlow.variables, parent.variables) });
      }
      target = continuation.target;
      continue;
    }

    if (++visitedGroups > MAX_GROUPS_PER_STEP) throw new Error("The chat bot flow loops without asking anything.");
    const flow = currentFlow(state);
    const group = flow.groups.find((g) => g.id === target!.groupId);
    if (!group) {
      target = undefined;
      continue;
    }
    let next: Target | undefined;

    for (let index = target.blockIndex; index < group.blocks.length; index++) {
      const block: Block = group.blocks[index]!;
      // The last block's edge decides where the group leads.
      next = targetOfEdge(currentFlow(state), block.outgoingEdgeId);

      if (BUBBLE_TYPES.has(block.type)) {
        const bubble = toChatBubble(block, currentFlow(state).variables);
        if (!bubble) continue;
        result.messages.push(bubble);
        state = addTranscript(state, "bot", bubbleToText(bubble));
        lastBubbleBlockId = block.id;
        continue;
      }

      if (INPUT_TYPES.has(block.type)) {
        const prepared = await services.prepareInput(block, { state, flow: currentFlow(state) });
        result.input = { ...formatInput(block, currentFlow(state)), ...prepared };
        result.state = { ...state, currentBlockId: block.id };
        return result;
      }

      if (INTEGRATION_TYPES.has(block.type)) {
        const outcome = await services.runIntegration(block, { state, flow: currentFlow(state) });
        if (outcome.variables) state = updateVariables(state, outcome.variables);
        if (outcome.logs) result.logs.push(...outcome.logs);
        if (outcome.clientSideActions) result.clientSideActions.push(...outcome.clientSideActions.map((action) => ({ ...action, lastBubbleBlockId })));
        continue;
      }

      if (!LOGIC_TYPES.has(block.type)) {
        result.logs.push({ status: "info", description: `Block type "${block.type}" is not supported by the chat runtime; skipped` });
        continue;
      }

      const logic = executeLogic(block, state, currentFlow(state));
      if (logic.variables) state = updateVariables(state, logic.variables);
      if (logic.clientSideActions) {
        result.clientSideActions.push(...logic.clientSideActions.map((action) => ({ ...action, lastBubbleBlockId })));
        // The chat UI replies (continueChat without message) once the action is done.
        if (logic.clientSideActions.some((action) => action.expectsDedicatedReply)) {
          result.state = { ...state, currentBlockId: block.id };
          return result;
        }
      }
      if (!logic.jump) continue;

      const jump = logic.jump;
      const flowNow = currentFlow(state);
      if (jump === "end") next = undefined;
      else if (jump === "return") {
        const returnTo = state.returnTarget;
        state = { ...state, returnTarget: undefined, ...(returnTo ? { currentFlowId: returnTo.flowId } : {}) };
        next = returnTo?.target;
      } else if ("edgeId" in jump) next = targetOfEdge(flowNow, jump.edgeId);
      else if ("linkChatBotId" in jump) {
        const linked = state.flows[jump.linkChatBotId];
        if (jump.linkChatBotId === flowNow.chatBotId) {
          next = jump.groupId ? groupTarget(flowNow, jump.groupId) : startTarget(flowNow);
        } else if (!linked) {
          result.logs.push({ status: "error", description: `Linked chat bot ${jump.linkChatBotId} is not published` });
          continue;
        } else {
          state = {
            ...state,
            continuations: [
              ...state.continuations,
              { flowId: flowNow.chatBotId, target: afterBlock(flowNow, group.id, index), mergeVariablesFromFlowId: jump.mergeVariables ? linked.chatBotId : undefined },
            ],
          };
          state = replaceFlow(state, { ...linked, variables: copyVariablesByName(flowNow.variables, linked.variables) });
          state = { ...state, currentFlowId: linked.chatBotId };
          next = jump.groupId ? groupTarget(linked, jump.groupId) : startTarget(linked);
        }
      } else {
        if (jump.setReturnPoint) {
          // A later Return block comes back to the block after this Jump.
          const after = afterBlock(flowNow, group.id, index);
          state = { ...state, returnTarget: after ? { flowId: flowNow.chatBotId, target: after } : undefined };
        }
        next = groupTarget(flowNow, jump.groupId, jump.blockId);
      }
      break;
    }
    target = next;
  }

  result.state = { ...state, currentBlockId: undefined };
  return result;
};

export const startFlow = (state: SessionState, services: EngineServices): Promise<StepResult> =>
  run(state, startTarget(currentFlow(state)), emptyResult(state), services);

export type Reply = { type: "text"; text: string; replyId?: string } | { type: "command"; command: string };

export const continueFlow = async (initialState: SessionState, reply: Reply | undefined, services: EngineServices): Promise<StepResult> => {
  let state = initialState;
  const result = emptyResult(state);
  const flow = currentFlow(state);
  const current = state.currentBlockId ? findBlock(flow, state.currentBlockId) : undefined;

  // Commands start their event's path; with "resume after", the conversation then comes back.
  if (reply?.type === "command") {
    const event = findEvent(flow, "command", (e) => (e.options as { command?: string } | undefined)?.command === reply.command);
    if (!event) return result;
    if ((event.options as { resumeAfter?: boolean } | undefined)?.resumeAfter && current)
      state = { ...state, continuations: [...state.continuations, { flowId: flow.chatBotId, target: { groupId: current.group.id, blockIndex: current.index } }] };
    return run({ ...state, currentBlockId: undefined }, targetOfEdge(flow, event.outgoingEdgeId), result, services);
  }

  if (!current) return { ...result, state: { ...state, currentBlockId: undefined } };
  const { group, block, index } = current;
  let next = afterBlock(flow, group.id, index);

  if (INPUT_TYPES.has(block.type)) {
    const text = reply?.text;
    const parsed: ParsedReply =
      text === undefined
        ? block.type === "file input" && block.options?.isRequired === false
          ? { status: "skip" }
          : { status: "fail" }
        : validateReply(block, text, { variables: flow.variables, replyId: reply?.replyId });

    if (parsed.status === "fail") {
      const invalidEvent = findEvent(flow, "invalidReply");
      if (invalidEvent) {
        state = setEventVariables(state, invalidEvent, block, text ?? "");
        state = { ...state, continuations: [...state.continuations, { flowId: flow.chatBotId, target: { groupId: group.id, blockIndex: index } }] };
        return run({ ...state, currentBlockId: undefined }, targetOfEdge(flow, invalidEvent.outgoingEdgeId), result, services);
      }
      const message: ChatBubble = {
        id: block.id,
        type: "text",
        content: { type: "richText", richText: [{ type: "p", children: [{ text: retryMessage(block, flow) }] }] },
      };
      const prepared = await services.prepareInput(block, { state, flow });
      return { ...result, messages: [message], input: { ...formatInput(block, flow), ...prepared } };
    }

    if (parsed.status === "success") {
      const variableId = block.options?.variableId as string | undefined;
      const variable = flow.variables.find((v) => v.id === variableId);
      if (variable) {
        const value = Array.isArray(variable.value) ? [...variable.value, parsed.content] : parsed.content;
        state = updateVariables(state, [{ id: variable.id, value }]);
      }
      if (parsed.variables) state = updateVariables(state, parsed.variables);
      const key = variable?.name ?? group.title;
      state = addTranscript(
        { ...state, answers: [...state.answers.filter((answer) => answer.key !== key), { blockId: block.id, key, value: parsed.content }] },
        "user",
        parsed.content,
      );
      result.answers.push({ blockId: block.id, content: parsed.content });
      if (text !== undefined && parsed.content !== text) result.lastMessageNewFormat = parsed.content;
      if (parsed.outgoingEdgeId) next = targetOfEdge(flow, parsed.outgoingEdgeId);

      const replyEvent = findEvent(flow, "reply");
      if (replyEvent) {
        state = setEventVariables(state, replyEvent, block, parsed.content);
        state = { ...state, continuations: [...state.continuations, { flowId: flow.chatBotId, target: next }] };
        next = targetOfEdge(flow, replyEvent.outgoingEdgeId);
      }
    }
  }

  return run({ ...state, currentBlockId: undefined }, next, result, services);
};

/** Reply / invalid-reply events can save the reply, the input's name and its type in variables. */
const setEventVariables = (state: SessionState, event: ChatBotEvent, block: Block, content: string) => {
  const options = (event.options ?? {}) as { contentVariableId?: string; inputNameVariableId?: string; inputTypeVariableId?: string };
  const flow = currentFlow(state);
  const inputName = flow.variables.find((v) => v.id === block.options?.variableId)?.name ?? flow.groups.find((g) => g.blocks.includes(block))?.title ?? block.id;
  const updates = [
    { id: options.contentVariableId, value: content },
    { id: options.inputNameVariableId, value: inputName },
    { id: options.inputTypeVariableId, value: INPUT_TYPE_NAMES[block.type] ?? block.type },
  ].filter((update): update is { id: string; value: string } => !!update.id && flow.variables.some((v) => v.id === update.id));
  return updateVariables(state, updates);
};
