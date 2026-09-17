import { memo } from "react";
import { EVENT_LABELS } from "../blocks/blockRegistry";
import { shallowEqual, useBuilder, useBuilderDispatch } from "../state/builderStore";
import { Port } from "./Port";
import { useNodeDrag } from "./useNodeDrag";

/** Event nodes: Start (where every conversation begins), Reply, Invalid reply and Command. */
export const EventNodes = () => {
  const eventIds = useBuilder((state) => state.chatBot.events.map((event) => event.id), shallowEqual);
  return (
    <>
      {eventIds.map((eventId) => (
        <EventNode key={eventId} eventId={eventId} />
      ))}
    </>
  );
};

const EventNode = memo(({ eventId }: { eventId: string }) => {
  const dispatch = useBuilderDispatch();
  const event = useBuilder((state) => state.chatBot.events.find((e) => e.id === eventId));
  const isSelected = useBuilder((state) => state.selection?.kind === "event" && state.selection.eventId === eventId);
  const startDrag = useNodeDrag(eventId, event?.graphCoordinates ?? { x: 0, y: 0 }, () => {
    if (event && event.type !== "start") dispatch({ type: "select", selection: { kind: "event", eventId } });
  });
  if (!event) return null;
  const command = (event.options as { command?: string } | undefined)?.command;

  return (
    <div
      className={`start-node${event.type === "start" ? "" : " start-node--event"}${isSelected ? " is-selected" : ""}`}
      data-event-id={event.id}
      style={{ transform: `translate(${event.graphCoordinates.x}px, ${event.graphCoordinates.y}px)` }}
      onPointerDown={startDrag}
    >
      <span>
        {event.type === "start" ? "▶ " : "⚡ "}
        {EVENT_LABELS[event.type] ?? event.type}
        {command ? ` /${command}` : ""}
      </span>
      <Port source={{ eventId: event.id }} />
    </div>
  );
});
