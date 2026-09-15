import { memo } from "react";
import { type BlockCategory, blockDefinitions, eventDefinitions, getBlockDefinition } from "./blocks/blockRegistry";
import { DND_NEW_BLOCK, DND_NEW_EVENT } from "./canvas/canvasContext";
import { useBuilderDispatch, useBuilderStore } from "./state/builderStore";

const CATEGORIES: BlockCategory[] = ["Bubbles", "Inputs", "Logic", "Integrations"];

/** Left panel. Drag a block onto a group or the canvas; click adds it to the selected group. */
export const BlockPalette = memo(() => {
  const store = useBuilderStore();
  const dispatch = useBuilderDispatch();

  const addToSelection = (type: string) => {
    const { selection, chatBot } = store.getState();
    const groupId = selection && "groupId" in selection ? selection.groupId : undefined;
    const group = chatBot.groups.find((g) => g.id === groupId);
    const block = getBlockDefinition(type).create();
    if (group) {
      dispatch({ type: "addBlock", groupId: group.id, index: group.blocks.length, block });
      dispatch({ type: "select", selection: { kind: "block", groupId: group.id, blockId: block.id } });
      return;
    }
    const lowest = chatBot.groups.reduce((max, g) => Math.max(max, g.graphCoordinates.y), 0);
    dispatch({ type: "addGroup", position: { x: 200, y: chatBot.groups.length ? lowest + 200 : 0 }, block });
  };

  const addEvent = (type: string) => {
    const definition = eventDefinitions.find((e) => e.type === type);
    const { chatBot } = store.getState();
    const lowest = chatBot.events.reduce((max, e) => Math.max(max, e.graphCoordinates.y), 0);
    if (definition) dispatch({ type: "addEvent", event: { ...definition.create(), graphCoordinates: { x: -300, y: lowest + 120 } } });
  };

  return (
    <aside className="palette">
      {CATEGORIES.map((category) => (
        <section key={category}>
          <h4 className="palette__category">{category}</h4>
          <div className="palette__grid">
            {blockDefinitions
              .filter((definition) => definition.category === category)
              .map((definition) => (
                <button
                  key={definition.type}
                  type="button"
                  draggable
                  className={`palette__item palette__item--${category.toLowerCase()}`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DND_NEW_BLOCK, definition.type);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addToSelection(definition.type)}
                >
                  {definition.label}
                </button>
              ))}
          </div>
        </section>
      ))}
      <section>
        <h4 className="palette__category">Events</h4>
        <div className="palette__grid">
          {eventDefinitions.map((definition) => (
            <button
              key={definition.type}
              type="button"
              draggable
              className="palette__item palette__item--events"
              title="Starts a path after every reply, an invalid reply, or a command"
              onDragStart={(event) => {
                event.dataTransfer.setData(DND_NEW_EVENT, definition.type);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addEvent(definition.type)}
            >
              {definition.label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
});
