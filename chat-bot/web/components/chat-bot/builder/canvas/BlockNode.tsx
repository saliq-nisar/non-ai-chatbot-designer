import { memo } from "react";
import type { Block } from "../../../../api/types";
import { categoryOf, getBlockDefinition } from "../blocks/blockRegistry";
import { itemPaths } from "../state/builderReducer";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";
import { DND_MOVE_BLOCK } from "./canvasContext";
import { Port } from "./Port";

type Props = { block: Block; groupId: string; isLast: boolean };

/** A block inside a group. Memoized: re-renders only when this block (or its selection) changes. */
export const BlockNode = memo(({ block, groupId, isLast }: Props) => {
  const dispatch = useBuilderDispatch();
  const isSelected = useBuilder((state) => state.selection?.kind === "block" && state.selection.blockId === block.id);
  const definition = getBlockDefinition(block.type);
  const { Summary, ItemLabel } = definition;
  const showBlockPort = isLast && !definition.hasNoOutgoingPort;

  return (
    <div
      className={`block-node block-node--${categoryOf(block.type).toLowerCase()}${isSelected ? " is-selected" : ""}`}
      data-block-id={block.id}
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData(DND_MOVE_BLOCK, block.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={(event) => {
        event.stopPropagation();
        dispatch({ type: "select", selection: { kind: "block", groupId, blockId: block.id } });
      }}
    >
      <div className="block-node__main">
        <span className="block-node__type">{definition.label}</span>
        <span className="block-node__summary">
          <Summary block={block} />
        </span>
        {showBlockPort && !block.items && <Port source={{ blockId: block.id }} />}
      </div>

      {block.items?.map((item) =>
        definition.hasItemPaths ? (
          // Cards: one row per card, one port per button.
          <div key={item.id} className="block-node__card">
            {ItemLabel ? <ItemLabel item={item} /> : item.id}
            {itemPaths(item).map((path) => (
              <div key={path.id} className="block-node__item">
                {path.text || "Button"}
                <Port source={{ blockId: block.id, itemId: item.id, pathId: path.id }} />
              </div>
            ))}
          </div>
        ) : (
          <div key={item.id} className="block-node__item">
            {ItemLabel ? <ItemLabel item={item} /> : item.id}
            <Port source={{ blockId: block.id, itemId: item.id }} />
          </div>
        ),
      )}
      {block.items && showBlockPort && (
        <div className="block-node__item block-node__item--default">
          <span className="block-node__muted">{block.type === "Condition" ? "Else" : "Default"}</span>
          <Port source={{ blockId: block.id }} />
        </div>
      )}
    </div>
  );
});
