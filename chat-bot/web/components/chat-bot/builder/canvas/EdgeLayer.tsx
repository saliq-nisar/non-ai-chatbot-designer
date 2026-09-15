import { memo, useLayoutEffect, useRef, useState } from "react";
import type { Coordinates, Edge } from "../../../../api/types";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import { portKey } from "./canvasContext";

type DrawnEdge = { id: string; from: Coordinates; to: Coordinates };

/** Smooth horizontal S-curve between two points. */
export const edgePath = (from: Coordinates, to: Coordinates) => {
  const dx = Math.max(40, Math.abs(to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
};

/**
 * Draws edges between ports and groups. Positions are measured from the DOM after
 * each graph change, so they always match the rendered nodes whatever their height.
 */
export const EdgeLayer = memo(({ getZoom }: { getZoom: () => number }) => {
  const dispatch = useBuilderDispatch();
  const edges = useBuilder((state) => state.chatBot.edges);
  const groups = useBuilder((state) => state.chatBot.groups);
  const events = useBuilder((state) => state.chatBot.events);
  const selectedEdgeId = useBuilder((state) => (state.selection?.kind === "edge" ? state.selection.edgeId : undefined));
  const [drawn, setDrawn] = useState<DrawnEdge[]>([]);
  // The canvas content element is this layer's parent. (Our own ref is attached before this
  // effect runs; a parent's ref is not, so the parent's ref can't be used here.)
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const content = svgRef.current?.parentElement;
    if (!content) return;

    const measure = () => {
      const origin = content.getBoundingClientRect();
      const zoom = getZoom();
      const toCanvas = (x: number, y: number) => ({ x: (x - origin.left) / zoom, y: (y - origin.top) / zoom });

      const ports = new Map<string, Element>();
      for (const element of content.querySelectorAll("[data-port]")) ports.set(element.getAttribute("data-port")!, element);

      const next: DrawnEdge[] = [];
      for (const edge of edges) {
        const port = ports.get(portKey(edge.from));
        const target = targetElement(content, edge);
        if (!port || !target) continue;
        const p = port.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        next.push({
          id: edge.id,
          from: toCanvas(p.left + p.width / 2, p.top + p.height / 2),
          to: toCanvas(t.left, t.top + Math.min(20, t.height / 2)),
        });
      }
      setDrawn(next);
    };

    measure();
    // Re-measure once web fonts are ready (text size affects node heights).
    let isCurrent = true;
    document.fonts?.ready.then(() => isCurrent && measure());
    return () => {
      isCurrent = false;
    };
  }, [getZoom, edges, groups, events]);

  return (
    <svg ref={svgRef} className="edge-layer">
      {drawn.map((edge) => {
        const d = edgePath(edge.from, edge.to);
        const isSelected = edge.id === selectedEdgeId;
        const mid = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 };
        return (
          <g key={edge.id} className={isSelected ? "edge is-selected" : "edge"}>
            <path className="edge__hit" d={d} onClick={() => dispatch({ type: "select", selection: { kind: "edge", edgeId: edge.id } })} />
            <path className="edge__line" d={d} markerEnd="url(#edge-arrow)" />
            {isSelected && (
              <g
                className="edge__delete"
                transform={`translate(${mid.x}, ${mid.y})`}
                onClick={() => dispatch({ type: "deleteEdge", edgeId: edge.id })}
              >
                <title>Delete connection</title>
                <circle r="10" />
                <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" />
              </g>
            )}
          </g>
        );
      })}
      <defs>
        <marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className="edge__arrow" />
        </marker>
      </defs>
    </svg>
  );
});

const targetElement = (content: HTMLElement, edge: Edge) =>
  (edge.to.blockId && content.querySelector(`[data-block-id="${CSS.escape(edge.to.blockId)}"]`)) ||
  content.querySelector(`[data-group-id="${CSS.escape(edge.to.groupId)}"]`);
