import { type DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Coordinates, EdgeSource } from "../../../../api/types";
import { eventDefinitions, getBlockDefinition } from "../blocks/blockRegistry";
import { shallowEqual, useBuilder, useBuilderDispatch, useBuilderStore } from "../state/builderStore";
import { type CanvasApi, CanvasContext, DND_MOVE_BLOCK, DND_NEW_BLOCK, DND_NEW_EVENT, portKey } from "./canvasContext";
import { EdgeLayer, edgePath } from "./EdgeLayer";
import { GroupNode } from "./GroupNode";
import { EventNodes } from "./EventNodes";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const GRID_SIZE = 20;

type Viewport = { x: number; y: number; zoom: number };
type PendingConnection = { source: EdgeSource; from: Coordinates; to: Coordinates };

/**
 * Pannable/zoomable canvas. Pan and zoom are applied straight to the DOM (no React
 * state), so moving the view never re-renders nodes.
 */
export const BuilderCanvas = () => {
  const store = useBuilderStore();
  const dispatch = useBuilderDispatch();
  const groupIds = useBuilder((state) => state.chatBot.groups.map((group) => group.id), shallowEqual);
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewport = useRef<Viewport>(initialViewport(store.getState().chatBot.events[0]?.graphCoordinates));
  const [pending, setPending] = useState<PendingConnection>();

  const applyViewport = () => {
    const { x, y, zoom } = viewport.current;
    if (contentRef.current) contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    if (canvasRef.current) {
      canvasRef.current.style.backgroundPosition = `${x}px ${y}px`;
      canvasRef.current.style.backgroundSize = `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`;
    }
  };

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const { x, y, zoom } = viewport.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    // Keep the point under the cursor fixed.
    viewport.current = { zoom: nextZoom, x: px - ((px - x) * nextZoom) / zoom, y: py - ((py - y) * nextZoom) / zoom };
    applyViewport();
  };

  const api = useMemo<CanvasApi>(
    () => ({
      getZoom: () => viewport.current.zoom,
      toCanvasPoint: (clientX, clientY) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const { x, y, zoom } = viewport.current;
        return { x: (clientX - rect.left - x) / zoom, y: (clientY - rect.top - y) / zoom };
      },
      startConnection: (source, event) => {
        const portRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const from = api.toCanvasPoint(portRect.left + portRect.width / 2, portRect.top + portRect.height / 2);
        setPending({ source, from, to: from });

        const onMove = (moveEvent: PointerEvent) =>
          setPending((current) => current && { ...current, to: api.toCanvasPoint(moveEvent.clientX, moveEvent.clientY) });
        const onUp = (upEvent: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          setPending(undefined);
          const groupId = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest("[data-group-id]")?.getAttribute("data-group-id");
          const ownGroupId = "blockId" in source ? document.querySelector(`[data-port="${portKey(source)}"]`)?.closest("[data-group-id]")?.getAttribute("data-group-id") : undefined;
          if (groupId && groupId !== ownGroupId) dispatch({ type: "connect", source, groupId });
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      },
    }),
    [], // only uses refs and the stable dispatch
  );

  useEffect(() => {
    applyViewport();
    const canvas = canvasRef.current!;
    // Wheel pans; Ctrl/⌘ + wheel (and trackpad pinch) zooms. Non-passive to prevent page scroll.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) return zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
      viewport.current = { ...viewport.current, x: viewport.current.x - event.deltaX, y: viewport.current.y - event.deltaY };
      applyViewport();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []); // once: the handlers only use refs

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target !== canvasRef.current && event.target !== contentRef.current)) return;
    dispatch({ type: "select", selection: undefined });
    const startX = event.clientX - viewport.current.x;
    const startY = event.clientY - viewport.current.y;
    const onMove = (moveEvent: PointerEvent) => {
      viewport.current = { ...viewport.current, x: moveEvent.clientX - startX, y: moveEvent.clientY - startY };
      applyViewport();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onDrop = (event: DragEvent) => {
    const newBlockType = event.dataTransfer.getData(DND_NEW_BLOCK);
    const movedBlockId = event.dataTransfer.getData(DND_MOVE_BLOCK);
    const newEventType = event.dataTransfer.getData(DND_NEW_EVENT);
    if (!newBlockType && !movedBlockId && !newEventType) return;
    event.preventDefault();
    const position = api.toCanvasPoint(event.clientX, event.clientY);
    if (newEventType) {
      const definition = eventDefinitions.find((e) => e.type === newEventType);
      if (definition) dispatch({ type: "addEvent", event: { ...definition.create(), graphCoordinates: position } });
      return;
    }
    if (newBlockType) {
      dispatch({ type: "addGroup", position, block: getBlockDefinition(newBlockType).create() });
      return;
    }
    // Dropping an existing block on empty canvas moves it into a new group.
    dispatch({ type: "moveBlockToNewGroup", blockId: movedBlockId, position });
  };

  return (
    <CanvasContext.Provider value={api}>
      <div
        ref={canvasRef}
        className="canvas"
        onPointerDown={startPan}
        onDragOver={(event) => {
          if ([DND_NEW_BLOCK, DND_MOVE_BLOCK, DND_NEW_EVENT].some((type) => event.dataTransfer.types.includes(type))) event.preventDefault();
        }}
        onDrop={onDrop}
      >
        <div ref={contentRef} className="canvas__content">
          <EdgeLayer getZoom={api.getZoom} />
          {pending && (
            <svg className="edge-layer edge-layer--pending">
              <path className="edge__line" d={edgePath(pending.from, pending.to)} />
            </svg>
          )}
          <EventNodes />
          {groupIds.map((groupId) => (
            <GroupNode key={groupId} groupId={groupId} />
          ))}
        </div>
        <div className="canvas__zoom">
          <button type="button" className="btn btn--sm" onClick={() => zoomAt(1.2)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="btn btn--sm" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">
            −
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              viewport.current = initialViewport(store.getState().chatBot.events[0]?.graphCoordinates);
              applyViewport();
            }}
          >
            Reset view
          </button>
        </div>
        {groupIds.length === 0 && <p className="canvas__hint">Drag a block from the left panel onto the canvas to start.</p>}
      </div>
    </CanvasContext.Provider>
  );
};

const initialViewport = (start: Coordinates | undefined): Viewport => ({
  x: 80 - (start?.x ?? 0),
  y: 80 - (start?.y ?? 0),
  zoom: 1,
});
