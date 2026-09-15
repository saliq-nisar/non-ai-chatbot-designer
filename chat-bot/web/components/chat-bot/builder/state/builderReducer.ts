import type { Block, ChatBot, ChatBotEvent, ChatBotSettings, ChatBotTheme, Coordinates, Edge, EdgeSource, Group, Item, Variable } from "../../../../api/types";
import { createId } from "./createId";

/**
 * Builder state and every change the builder can make to a chat bot.
 * Pure functions only: easy to test, easy to extend (add an action + a case).
 *
 * Graph integrity rules kept by these functions:
 *  - an edge's source (block / item / event) stores the edge id in `outgoingEdgeId`
 *  - a source has at most one outgoing edge
 *  - only the last block of a group has a block-level outgoing edge
 *  - removing a block/group removes the edges from and to it; empty groups are removed
 */

export type Selection =
  | { kind: "group"; groupId: string }
  | { kind: "block"; groupId: string; blockId: string }
  | { kind: "edge"; edgeId: string }
  | { kind: "event"; eventId: string };

export type BuilderState = {
  chatBot: ChatBot;
  selection?: Selection;
  /** Incremented on every content change; compared with savedRevision to know if there are unsaved changes. */
  revision: number;
  savedRevision: number;
};

export type BuilderAction =
  | { type: "select"; selection?: Selection }
  | { type: "rename"; name: string }
  | { type: "moveNode"; nodeId: string; position: Coordinates }
  | { type: "addGroup"; position: Coordinates; block: Block }
  | { type: "renameGroup"; groupId: string; title: string }
  | { type: "deleteGroup"; groupId: string }
  | { type: "addBlock"; groupId: string; index: number; block: Block }
  | { type: "moveBlock"; blockId: string; groupId: string; index: number }
  | { type: "moveBlockToNewGroup"; blockId: string; position: Coordinates }
  | { type: "updateBlock"; block: Block }
  | { type: "addEvent"; event: ChatBotEvent }
  | { type: "updateEvent"; event: ChatBotEvent }
  | { type: "deleteEvent"; eventId: string }
  | { type: "deleteBlock"; blockId: string }
  | { type: "connect"; source: EdgeSource; groupId: string }
  | { type: "deleteEdge"; edgeId: string }
  | { type: "addVariable"; variable: Variable }
  | { type: "renameVariable"; variableId: string; name: string }
  | { type: "deleteVariable"; variableId: string }
  | { type: "updateTheme"; theme: ChatBotTheme }
  | { type: "updateSettings"; settings: ChatBotSettings }
  | { type: "setPublicId"; publicId: string | null }
  | { type: "saved"; revision: number; updatedAt: string; publicId: string | null };

export const createBuilderState = (chatBot: ChatBot): BuilderState => ({ chatBot, revision: 0, savedRevision: 0 });

export const builderReducer = (state: BuilderState, action: BuilderAction): BuilderState => {
  switch (action.type) {
    case "select":
      return { ...state, selection: action.selection };
    case "saved":
      return {
        ...state,
        savedRevision: action.revision,
        chatBot: { ...state.chatBot, updatedAt: action.updatedAt, publicId: action.publicId },
      };
    default: {
      const chatBot = applyChange(state.chatBot, action);
      if (chatBot === state.chatBot) return state;
      return { ...state, chatBot, revision: state.revision + 1, selection: nextSelection(state.selection, action) };
    }
  }
};

const applyChange = (bot: ChatBot, action: BuilderAction): ChatBot => {
  switch (action.type) {
    case "rename":
      return { ...bot, name: action.name };

    case "moveNode":
      if (bot.events.some((event) => event.id === action.nodeId))
        return {
          ...bot,
          events: bot.events.map((event) => (event.id === action.nodeId ? { ...event, graphCoordinates: action.position } : event)),
        };
      return updateGroup(bot, action.nodeId, (group) => ({ ...group, graphCoordinates: action.position }));

    case "addGroup": {
      const group: Group = {
        id: createId(),
        title: nextGroupTitle(bot.groups),
        graphCoordinates: action.position,
        blocks: [action.block],
      };
      return { ...bot, groups: [...bot.groups, group] };
    }

    case "renameGroup":
      return updateGroup(bot, action.groupId, (group) => ({ ...group, title: action.title }));

    case "deleteGroup": {
      const group = bot.groups.find((g) => g.id === action.groupId);
      if (!group) return bot;
      const blockIds = new Set(group.blocks.map((block) => block.id));
      const cleaned = removeEdges(
        bot,
        (edge) => edge.to.groupId === group.id || ("blockId" in edge.from && blockIds.has(edge.from.blockId)),
      );
      return { ...cleaned, groups: cleaned.groups.filter((g) => g.id !== group.id) };
    }

    case "addBlock": {
      const withBlock = updateGroup(bot, action.groupId, (group) => ({
        ...group,
        blocks: insertAt(group.blocks, action.index, action.block),
      }));
      return keepOutgoingEdgeOnLastBlock(withBlock, action.groupId);
    }

    case "moveBlock": {
      const fromGroup = bot.groups.find((group) => group.blocks.some((block) => block.id === action.blockId));
      const block = fromGroup?.blocks.find((b) => b.id === action.blockId);
      if (!fromGroup || !block) return bot;
      let index = action.index;
      if (fromGroup.id === action.groupId) {
        const currentIndex = fromGroup.blocks.indexOf(block);
        if (currentIndex < index) index -= 1;
        if (currentIndex === index) return bot;
      }
      let next = updateGroup(bot, fromGroup.id, (group) => ({ ...group, blocks: group.blocks.filter((b) => b !== block) }));
      // Edges pointing at this exact block now point at its group.
      next = {
        ...next,
        edges: next.edges.map((edge) =>
          edge.to.blockId === block.id ? { ...edge, to: { groupId: action.groupId, blockId: block.id } } : edge,
        ),
      };
      next = updateGroup(next, action.groupId, (group) => ({ ...group, blocks: insertAt(group.blocks, index, block) }));
      next = keepOutgoingEdgeOnLastBlock(next, action.groupId);
      if (fromGroup.id !== action.groupId) next = removeGroupIfEmpty(keepOutgoingEdgeOnLastBlock(next, fromGroup.id), fromGroup.id);
      return next;
    }

    case "moveBlockToNewGroup": {
      if (!bot.groups.some((group) => group.blocks.some((block) => block.id === action.blockId))) return bot;
      const group: Group = { id: createId(), title: nextGroupTitle(bot.groups), graphCoordinates: action.position, blocks: [] };
      return applyChange({ ...bot, groups: [...bot.groups, group] }, { type: "moveBlock", blockId: action.blockId, groupId: group.id, index: 0 });
    }

    case "updateBlock":
      return {
        ...bot,
        groups: bot.groups.map((group) =>
          group.blocks.some((block) => block.id === action.block.id)
            ? { ...group, blocks: group.blocks.map((block) => (block.id === action.block.id ? action.block : block)) }
            : group,
        ),
        // Items (and card buttons) removed in the editor take their edges with them.
        edges: bot.edges.filter((edge) => {
          if (!("blockId" in edge.from) || edge.from.blockId !== action.block.id || !edge.from.itemId) return true;
          const { itemId, pathId } = edge.from;
          const item = (action.block.items ?? []).find((i) => i.id === itemId);
          return !!item && (!pathId || itemPaths(item).some((path) => path.id === pathId));
        }),
      };

    case "addEvent":
      return { ...bot, events: [...bot.events, action.event] };

    case "updateEvent":
      return { ...bot, events: bot.events.map((event) => (event.id === action.event.id ? action.event : event)) };

    case "deleteEvent": {
      const event = bot.events.find((e) => e.id === action.eventId);
      if (!event || event.type === "start") return bot;
      const cleaned = removeEdges(bot, (edge) => "eventId" in edge.from && edge.from.eventId === action.eventId);
      return { ...cleaned, events: cleaned.events.filter((e) => e.id !== action.eventId) };
    }

    case "deleteBlock": {
      const group = bot.groups.find((g) => g.blocks.some((block) => block.id === action.blockId));
      if (!group) return bot;
      const cleaned = removeEdges(
        bot,
        (edge) => edge.to.blockId === action.blockId || ("blockId" in edge.from && edge.from.blockId === action.blockId),
      );
      const next = updateGroup(cleaned, group.id, (g) => ({ ...g, blocks: g.blocks.filter((b) => b.id !== action.blockId) }));
      return removeGroupIfEmpty(next, group.id);
    }

    case "connect": {
      const cleaned = removeEdges(bot, (edge) => isSameSource(edge.from, action.source));
      const edge: Edge = { id: createId(), from: action.source, to: { groupId: action.groupId } };
      return setOutgoingEdgeId({ ...cleaned, edges: [...cleaned.edges, edge] }, action.source, edge.id);
    }

    case "deleteEdge":
      return removeEdges(bot, (edge) => edge.id === action.edgeId);

    case "addVariable":
      return { ...bot, variables: [...bot.variables, action.variable] };

    case "renameVariable":
      return {
        ...bot,
        variables: bot.variables.map((variable) => (variable.id === action.variableId ? { ...variable, name: action.name } : variable)),
      };

    case "deleteVariable":
      return { ...bot, variables: bot.variables.filter((variable) => variable.id !== action.variableId) };

    case "updateTheme":
      return { ...bot, theme: action.theme };

    case "updateSettings":
      return { ...bot, settings: action.settings };

    case "setPublicId":
      return { ...bot, publicId: action.publicId };

    default:
      return bot;
  }
};

const nextSelection = (selection: Selection | undefined, action: BuilderAction): Selection | undefined => {
  if (action.type === "addGroup") return undefined;
  if (!selection) return selection;
  if (action.type === "deleteGroup" && "groupId" in selection && selection.groupId === action.groupId) return undefined;
  if (action.type === "deleteBlock" && selection.kind === "block" && selection.blockId === action.blockId) return undefined;
  if (action.type === "deleteEdge" && selection.kind === "edge" && selection.edgeId === action.edgeId) return undefined;
  if (action.type === "deleteEvent" && selection.kind === "event" && selection.eventId === action.eventId) return undefined;
  if (action.type === "moveBlock" && selection.kind === "block" && selection.blockId === action.blockId)
    return { ...selection, groupId: action.groupId };
  if (action.type === "moveBlockToNewGroup" && selection.kind === "block" && selection.blockId === action.blockId) return undefined;
  return selection;
};

// ---- helpers ------------------------------------------------------------------

const insertAt = <T>(list: T[], index: number, item: T) => [...list.slice(0, index), item, ...list.slice(index)];

const updateGroup = (bot: ChatBot, groupId: string, update: (group: Group) => Group): ChatBot => ({
  ...bot,
  groups: bot.groups.map((group) => (group.id === groupId ? update(group) : group)),
});

const nextGroupTitle = (groups: Group[]) => {
  const used = new Set(groups.map((group) => group.title));
  let n = groups.length + 1;
  while (used.has(`Group #${n}`)) n++;
  return `Group #${n}`;
};

const removeGroupIfEmpty = (bot: ChatBot, groupId: string): ChatBot => {
  const group = bot.groups.find((g) => g.id === groupId);
  if (!group || group.blocks.length > 0) return bot;
  const cleaned = removeEdges(bot, (edge) => edge.to.groupId === groupId);
  return { ...cleaned, groups: cleaned.groups.filter((g) => g.id !== groupId) };
};

/** Card buttons ("paths") inside a cards item. */
export const itemPaths = (item: Item) => (Array.isArray(item.paths) ? (item.paths as { id: string; text?: string; outgoingEdgeId?: string }[]) : []);

const isSameSource = (a: EdgeSource, b: EdgeSource) =>
  "eventId" in a || "eventId" in b
    ? "eventId" in a && "eventId" in b && a.eventId === b.eventId
    : a.blockId === b.blockId && a.itemId === b.itemId && a.pathId === b.pathId;

/** Removes matching edges and clears every `outgoingEdgeId` that referenced them. */
const removeEdges = (bot: ChatBot, shouldRemove: (edge: Edge) => boolean): ChatBot => {
  const removedIds = new Set(bot.edges.filter(shouldRemove).map((edge) => edge.id));
  if (removedIds.size === 0) return bot;
  const clear = <T extends { outgoingEdgeId?: string }>(node: T): T =>
    node.outgoingEdgeId && removedIds.has(node.outgoingEdgeId) ? { ...node, outgoingEdgeId: undefined } : node;

  const references = (block: Block) =>
    (block.outgoingEdgeId && removedIds.has(block.outgoingEdgeId)) ||
    block.items?.some(
      (item) => (item.outgoingEdgeId && removedIds.has(item.outgoingEdgeId)) || itemPaths(item).some((path) => path.outgoingEdgeId && removedIds.has(path.outgoingEdgeId)),
    );

  return {
    ...bot,
    edges: bot.edges.filter((edge) => !removedIds.has(edge.id)),
    events: bot.events.map(clear),
    // Untouched groups keep their reference so their nodes don't re-render.
    groups: bot.groups.map((group) =>
      group.blocks.some(references)
        ? {
            ...group,
            blocks: group.blocks.map((block) => {
              if (!references(block)) return block;
              const cleared = clear(block);
              return cleared.items
                ? { ...cleared, items: cleared.items.map((item) => (item.paths ? { ...clear(item), paths: itemPaths(item).map(clear) } : clear(item))) }
                : cleared;
            }),
          }
        : group,
    ),
  };
};

const setOutgoingEdgeId = (bot: ChatBot, source: EdgeSource, edgeId: string): ChatBot => {
  if ("eventId" in source)
    return {
      ...bot,
      events: bot.events.map((event) => (event.id === source.eventId ? { ...event, outgoingEdgeId: edgeId } : event)),
    };
  return {
    ...bot,
    groups: bot.groups.map((group) => {
      if (!group.blocks.some((block) => block.id === source.blockId)) return group;
      return {
        ...group,
        blocks: group.blocks.map((block) => {
          if (block.id !== source.blockId) return block;
          if (!source.itemId) return { ...block, outgoingEdgeId: edgeId };
          return {
            ...block,
            items: block.items?.map((item) => {
              if (item.id !== source.itemId) return item;
              if (!source.pathId) return { ...item, outgoingEdgeId: edgeId };
              return { ...item, paths: itemPaths(item).map((path) => (path.id === source.pathId ? { ...path, outgoingEdgeId: edgeId } : path)) };
            }),
          };
        }),
      };
    }),
  };
};

/** A block-level edge on a block that is no longer last moves to the last block (or is removed). */
const keepOutgoingEdgeOnLastBlock = (bot: ChatBot, groupId: string): ChatBot => {
  const group = bot.groups.find((g) => g.id === groupId);
  const lastBlock = group?.blocks.at(-1);
  if (!group || !lastBlock) return bot;
  let next = bot;
  for (const block of group.blocks.slice(0, -1)) {
    if (!block.outgoingEdgeId) continue;
    const edgeId = block.outgoingEdgeId;
    const currentLast = next.groups.find((g) => g.id === groupId)!.blocks.at(-1)!;
    if (currentLast.outgoingEdgeId) {
      next = removeEdges(next, (edge) => edge.id === edgeId);
      continue;
    }
    next = {
      ...next,
      edges: next.edges.map((edge) => (edge.id === edgeId ? { ...edge, from: { blockId: currentLast.id } } : edge)),
      groups: next.groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              blocks: g.blocks.map((b) =>
                b.id === block.id ? { ...b, outgoingEdgeId: undefined } : b.id === currentLast.id ? { ...b, outgoingEdgeId: edgeId } : b,
              ),
            },
      ),
    };
  }
  return next;
};
