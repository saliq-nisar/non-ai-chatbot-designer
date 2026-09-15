import { type FormEvent, useState } from "react";
import { chatBotApi } from "../../../api/chatBotApi";
import { errorMessage } from "../../../api/http";
import { appConfig } from "../../../config";
import { navigate, routes } from "../../../router";
import { type ChatBotTemplate, chatBotTemplates, loadTemplate } from "../../../templates";
import { Dialog } from "../shared/Dialog";

/** New chat bot: blank, or from a built-in template (imported as a new draft). */
export const CreateChatBotDialog = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const run = async (key: string, create: () => Promise<{ id: string }>) => {
    setBusy(key);
    setError(undefined);
    try {
      navigate(routes.builder((await create()).id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(undefined);
    }
  };

  const createBlank = (event: FormEvent) => {
    event.preventDefault();
    run("blank", () => chatBotApi.createChatBot(appConfig.workspaceId, { name: name.trim() || "My chat bot" }));
  };

  const useTemplate = (template: ChatBotTemplate) =>
    run(template.file, async () => {
      const json = await loadTemplate(template);
      return chatBotApi.importChatBot(appConfig.workspaceId, { ...json, name: name.trim() || template.name });
    });

  return (
    <Dialog title="Create chat bot" onClose={onClose} width="720px">
      <form onSubmit={createBlank}>
        <label className="field">
          <span className="field__label">Name</span>
          <div className="field--inline">
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My chat bot" />
            <button type="submit" className="btn btn--primary" disabled={!!busy}>
              {busy === "blank" ? "Creating…" : "Start from scratch"}
            </button>
          </div>
        </label>
      </form>

      <h3 className="template-heading">Or start from a template</h3>
      <div className="template-grid">
        {chatBotTemplates.map((template) => (
          <button key={template.file} type="button" className="card template-card" disabled={!!busy} onClick={() => useTemplate(template)}>
            <span className="template-card__emoji" aria-hidden="true">
              {template.emoji}
            </span>
            <strong>{busy === template.file ? "Creating…" : template.name}</strong>
            <span className="template-card__category">{template.category}</span>
            <span className="field__hint">{template.description}</span>
          </button>
        ))}
      </div>
      {error && <p className="alert">{error}</p>}
    </Dialog>
  );
};
