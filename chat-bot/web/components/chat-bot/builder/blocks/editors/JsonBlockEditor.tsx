import { useState } from "react";
import type { Block } from "../../../../../api/types";
import type { BlockEditorProps } from "../blockHelpers";

/**
 * Fallback for block types without a dedicated editor (e.g. HTTP request blocks from
 * an imported chat bot). The block is kept exactly as-is unless its JSON is edited here.
 */
export const JsonBlockEditor = ({ block, onChange }: BlockEditorProps) => {
  const { id, type, outgoingEdgeId, items, ...editable } = block;
  const [text, setText] = useState(() => JSON.stringify(editable, null, 2));
  const [error, setError] = useState<string>();

  const apply = () => {
    try {
      const parsed = JSON.parse(text) as Partial<Block>;
      // id, type, edges and items are structural and stay untouched.
      onChange({ ...parsed, id, type, outgoingEdgeId, items } as Block);
      setError(undefined);
    } catch {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="field">
      <p className="field__hint">No visual editor for “{type}” blocks. Its settings are preserved; advanced users can edit the JSON.</p>
      <textarea className="textarea textarea--code" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {error && <p className="alert">{error}</p>}
      <button type="button" className="btn btn--sm" onClick={apply}>
        Apply JSON
      </button>
    </div>
  );
};
