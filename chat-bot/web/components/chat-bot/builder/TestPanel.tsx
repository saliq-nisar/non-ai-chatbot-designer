import { useState } from "react";
import { ChatViewer } from "../viewer/ChatViewer";
import { useBuilder } from "./state/builderStore";
import type { ChatBotLifecycle } from "./useChatBotLifecycle";

// Test conversations are not recorded and trigger no webhook.
const TEST_CONTEXT = { mode: "test" } as const;

/**
 * Test the chat bot inside the builder, with the same ChatViewer the Web Chat uses.
 * startChat runs published chat bots (by public ID), so testing needs the latest
 * changes saved and the chat bot published. Saving a published chat bot updates its
 * published version.
 */
export const TestPanel = ({ lifecycle, onClose }: { lifecycle: ChatBotLifecycle; onClose: () => void }) => {
  const isDirty = useBuilder((state) => state.revision !== state.savedRevision);
  const savedRevision = useBuilder((state) => state.savedRevision);
  const publicId = useBuilder((state) => state.chatBot.publicId);
  const [restartCount, setRestartCount] = useState(0);
  const { published, busy } = lifecycle;

  let notice: { message: string; action: string; onClick: () => void } | undefined;
  if (!published) notice = { message: "Publish the chat bot to test it.", action: "Publish", onClick: lifecycle.publish };
  else if (isDirty) notice = { message: "Save your changes to test the latest version.", action: "Save", onClick: lifecycle.save };

  return (
    <aside className="test-panel">
      <div className="inspector__header test-panel__header">
        <h3 className="inspector__title">Test</h3>
        <div className="page__actions">
          <button type="button" className="btn btn--sm" onClick={() => setRestartCount((n) => n + 1)} disabled={!published || !publicId}>
            Restart
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {notice && (
        <div className="alert alert--info test-panel__notice">
          <span>{notice.message}</span>
          <button type="button" className="btn btn--sm btn--primary" onClick={notice.onClick} disabled={!!busy}>
            {busy ? "Working…" : notice.action}
          </button>
        </div>
      )}
      <div className="test-panel__chat">
        {published && publicId && (
          // A new key (restart or new save) starts a new session.
          <ChatViewer key={`${savedRevision}-${restartCount}`} publicId={publicId} context={TEST_CONTEXT} />
        )}
      </div>
    </aside>
  );
};
