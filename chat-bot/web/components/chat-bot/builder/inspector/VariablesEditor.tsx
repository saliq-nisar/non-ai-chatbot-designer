import { useState } from "react";
import { createId } from "../state/createId";
import { useBuilder, useBuilderDispatch } from "../state/builderStore";

export const VariablesEditor = () => {
  const dispatch = useBuilderDispatch();
  const variables = useBuilder((state) => state.chatBot.variables);
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (!name || variables.some((variable) => variable.name === name)) return;
    dispatch({ type: "addVariable", variable: { id: createId(), name } });
    setNewName("");
  };

  return (
    <>
      <p className="field__hint">Insert a variable in any text with {"{{Variable name}}"}.</p>
      <ul className="variable-list">
        {variables.map((variable) => (
          <li key={variable.id}>
            <input
              className="input"
              aria-label="Variable name"
              value={variable.name}
              onChange={(e) => dispatch({ type: "renameVariable", variableId: variable.id, name: e.target.value })}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => dispatch({ type: "deleteVariable", variableId: variable.id })}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="field--inline">
        <input
          className="input"
          placeholder="New variable"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" className="btn btn--sm" onClick={add}>
          Add
        </button>
      </div>
    </>
  );
};
