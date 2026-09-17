import { useMemo, useState } from "react";
import type { ChatContext } from "../../../api/chatApi";
import { ChatViewer } from "../viewer/ChatViewer";
import { useBuilder, useBuilderStore } from "./state/builderStore";

/**
 * Test the chat bot inside the builder, with the same ChatViewer the Web Chat uses.
 * It runs the editor's current version (unsaved and unpublished changes included).
 * Test conversations are not recorded and trigger no webhook or email.
 */
export const TestPanel = ({ onClose }: { onClose: () => void }) => {
  const store = useBuilderStore();
  const chatBotId = useBuilder((state) => state.chatBot.id);
  const revision = useBuilder((state) => state.revision);
  const [run, setRun] = useState(() => ({ count: 0, revision: store.getState().revision }));

  const context = useMemo<ChatContext>(() => {
    // The draft is read when the conversation starts, so a restart always uses the latest edits.
    const getDraft = () => {
      const { groups, events, edges, variables, theme, settings } = store.getState().chatBot;
      return { groups, events, edges, variables, theme, settings };
    };
    return { mode: "preview", chatBotId, getDraft };
  }, [store, chatBotId]);

  const restart = () => setRun((current) => ({ count: current.count + 1, revision: store.getState().revision }));

  return (
    <aside className="test-panel">
      <div className="inspector__header test-panel__header">
        <h3 className="inspector__title">Test</h3>
        <div className="page__actions">
          <button type="button" className="btn btn--sm" onClick={restart}>
            Restart
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {revision !== run.revision && (
        <div className="alert alert--info test-panel__notice">
          <span>You changed the chat bot. Restart to test the latest version.</span>
          <button type="button" className="btn btn--sm btn--primary" onClick={restart}>
            Restart
          </button>
        </div>
      )}
      <div className="test-panel__chat">
        {/* A new key starts a new conversation. */}
        <ChatViewer key={run.count} publicId="" context={context} />
      </div>
    </aside>
  );
};
