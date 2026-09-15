import type { PointerEvent as ReactPointerEvent } from "react";
import type { Coordinates } from "../../../../api/types";
import { useBuilderDispatch } from "../state/builderStore";
import { useCanvas } from "./canvasContext";

const CLICK_TOLERANCE_PX = 3;

/**
 * Drags a group or the start node. Position updates are batched to one per
 * animation frame; a press without movement is reported as a click.
 */
export const useNodeDrag = (nodeId: string, position: Coordinates, onClick?: () => void) => {
  const dispatch = useBuilderDispatch();
  const canvas = useCanvas();

  return (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = canvas.getZoom();
    let moved = false;
    let frame = 0;
    let latest = position;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;
      if (!moved && Math.hypot(dx, dy) < CLICK_TOLERANCE_PX) return;
      moved = true;
      latest = { x: Math.round(position.x + dx), y: Math.round(position.y + dy) };
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          dispatch({ type: "moveNode", nodeId, position: latest });
        });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(frame);
      if (moved) dispatch({ type: "moveNode", nodeId, position: latest });
      else onClick?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
};
