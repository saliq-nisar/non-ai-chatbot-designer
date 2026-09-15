import { navigate, routes } from "../../../router";
import { useBuilder, useBuilderDispatch } from "./state/builderStore";
import type { ChatBotLifecycle } from "./useChatBotLifecycle";

type Props = {
  lifecycle: ChatBotLifecycle;
  onTest: () => void;
  onWebChat: () => void;
};

export const BuilderToolbar = ({ lifecycle, onTest, onWebChat }: Props) => {
  const dispatch = useBuilderDispatch();
  const name = useBuilder((state) => state.chatBot.name);
  const isDirty = useBuilder((state) => state.revision !== state.savedRevision);
  const { published, busy } = lifecycle;

  const goBack = () => {
    if (isDirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    navigate(routes.list());
  };

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <button type="button" className="btn btn--ghost" onClick={goBack} aria-label="Back to chat bots">
          ←
        </button>
        <input
          className="input toolbar__name"
          aria-label="Chat bot name"
          value={name}
          onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
        />
        {published ? <span className="badge badge--published">Published</span> : <span className="badge badge--draft">Draft</span>}
        <span className="toolbar__save-state">{busy === "saving" ? "Saving…" : isDirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>

      <div className="toolbar__group">
        <button type="button" className="btn" onClick={lifecycle.save} disabled={!isDirty || !!busy} title="Ctrl+S">
          Save
        </button>
        <button type="button" className="btn" onClick={onTest}>
          Test
        </button>
        <button type="button" className="btn" onClick={onWebChat}>
          Web Chat
        </button>
        {published && (
          <button type="button" className="btn" onClick={lifecycle.unpublish} disabled={!!busy}>
            {busy === "unpublishing" ? "Unpublishing…" : "Unpublish"}
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={lifecycle.publish} disabled={!!busy}>
          {busy === "publishing" ? "Publishing…" : published ? (isDirty ? "Save & update" : "Publish again") : "Publish"}
        </button>
      </div>
    </header>
  );
};
