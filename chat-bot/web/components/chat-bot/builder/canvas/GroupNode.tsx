import { type DragEvent, Fragment, memo, useState } from "react";
import { getBlockDefinition } from "../blocks/blockRegistry";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import { BlockNode } from "./BlockNode";
import { DND_MOVE_BLOCK, DND_NEW_BLOCK } from "./canvasContext";
import { useNodeDrag } from "./useNodeDrag";

const acceptsDrop = (event: DragEvent) =>
  event.dataTransfer.types.includes(DND_NEW_BLOCK) || event.dataTransfer.types.includes(DND_MOVE_BLOCK);

/** Index where a dragged block would be inserted, from the pointer's vertical position. */
const dropIndexAt = (container: HTMLElement, clientY: number) => {
  const blocks = [...container.querySelectorAll<HTMLElement>(":scope > [data-block-id]")];
  const index = blocks.findIndex((element) => {
    const rect = element.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  return index === -1 ? blocks.length : index;
};

export const GroupNode = memo(({ groupId }: { groupId: string }) => {
  const dispatch = useBuilderDispatch();
  const group = useBuilder((state) => state.chatBot.groups.find((g) => g.id === groupId));
  const isSelected = useBuilder((state) => state.selection?.kind === "group" && state.selection.groupId === groupId);
  const [dropIndex, setDropIndex] = useState<number>();
  const startDrag = useNodeDrag(groupId, group?.graphCoordinates ?? { x: 0, y: 0 }, () =>
    dispatch({ type: "select", selection: { kind: "group", groupId } }),
  );

  if (!group) return null;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = dropIndexAt(event.currentTarget, event.clientY);
    setDropIndex(undefined);
    const newBlockType = event.dataTransfer.getData(DND_NEW_BLOCK);
    if (newBlockType) {
      const block = getBlockDefinition(newBlockType).create();
      dispatch({ type: "addBlock", groupId, index, block });
      dispatch({ type: "select", selection: { kind: "block", groupId, blockId: block.id } });
      return;
    }
    const blockId = event.dataTransfer.getData(DND_MOVE_BLOCK);
    if (blockId) dispatch({ type: "moveBlock", blockId, groupId, index });
  };

  return (
    <div
      className={`group-node${isSelected ? " is-selected" : ""}`}
      data-group-id={group.id}
      style={{ transform: `translate(${group.graphCoordinates.x}px, ${group.graphCoordinates.y}px)` }}
    >
      <div className="group-node__header" onPointerDown={startDrag}>
        {group.title}
      </div>
      <div
        className="group-node__blocks"
        onDragOver={(event) => {
          if (!acceptsDrop(event)) return;
          event.preventDefault();
          event.stopPropagation();
          const index = dropIndexAt(event.currentTarget, event.clientY);
          if (index !== dropIndex) setDropIndex(index);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(undefined);
        }}
        onDrop={onDrop}
      >
        {group.blocks.map((block, index) => (
          <Fragment key={block.id}>
            {dropIndex === index && <div className="drop-indicator" />}
            <BlockNode block={block} groupId={group.id} isLast={index === group.blocks.length - 1} />
          </Fragment>
        ))}
        {dropIndex === group.blocks.length && <div className="drop-indicator" />}
      </div>
    </div>
  );
});

