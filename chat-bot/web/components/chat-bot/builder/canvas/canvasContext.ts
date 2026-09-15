import { createContext, type PointerEvent, useContext } from "react";
import type { Coordinates, EdgeSource } from "../../../../api/types";

/** Drag-and-drop payload types. */
export const DND_NEW_BLOCK = "application/x-chat-bot-new-block";
export const DND_MOVE_BLOCK = "application/x-chat-bot-move-block";
export const DND_NEW_EVENT = "application/x-chat-bot-new-event";

/** DOM key of an outgoing port, shared by the port elements and the edge layer. */
export const portKey = (source: EdgeSource) =>
  "eventId" in source
    ? `event:${source.eventId}`
    : source.pathId
      ? `path:${source.blockId}:${source.itemId}:${source.pathId}`
      : source.itemId
        ? `item:${source.blockId}:${source.itemId}`
        : `block:${source.blockId}`;

/** Canvas services for nodes. Stable for the canvas lifetime: never causes re-renders. */
export type CanvasApi = {
  /** Converts a screen position to canvas coordinates (accounts for pan and zoom). */
  toCanvasPoint: (clientX: number, clientY: number) => Coordinates;
  getZoom: () => number;
  /** Starts dragging a new connection from an outgoing port. */
  startConnection: (source: EdgeSource, event: PointerEvent) => void;
};

export const CanvasContext = createContext<CanvasApi | null>(null);

export const useCanvas = () => {
  const canvas = useContext(CanvasContext);
  if (!canvas) throw new Error("useCanvas must be used inside BuilderCanvas");
  return canvas;
};
