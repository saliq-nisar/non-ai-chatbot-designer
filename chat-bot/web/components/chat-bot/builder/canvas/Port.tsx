import type { EdgeSource } from "../../../../api/types";
import { portKey, useCanvas } from "./canvasContext";

/** Outgoing connection handle. Drag it onto a group to connect. */
export const Port = ({ source }: { source: EdgeSource }) => {
  const canvas = useCanvas();
  return (
    <span
      className="port"
      data-port={portKey(source)}
      title="Drag to a group to connect"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault(); // prevents the parent block's native drag
        event.stopPropagation();
        canvas.startConnection(source, event);
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
};
