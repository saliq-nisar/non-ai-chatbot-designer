import { useState } from "react";
import { chatBotApi } from "../../../api/chatBotApi";
import { errorMessage } from "../../../api/http";
import { appConfig } from "../../../config";
import { navigate, routes } from "../../../router";
import { Dialog } from "../shared/Dialog";

/** Imports a chat bot exported as JSON (from this system or the existing builder). */
export const ImportChatBotDialog = ({ onClose }: { onClose: () => void }) => {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);

  const importFile = async () => {
    if (!file) return;
    setIsBusy(true);
    setError(undefined);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error("The file is not valid JSON.");
      }
      const chatBot = await chatBotApi.importChatBot(appConfig.workspaceId, json);
      navigate(routes.builder(chatBot.id));
    } catch (err) {
      setError(errorMessage(err));
      setIsBusy(false);
    }
  };

  return (
    <Dialog
      title="Import chat bot"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!file || isBusy} onClick={importFile}>
            {isBusy ? "Importing…" : "Import"}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Chat bot JSON file</span>
        <input className="input" type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0])} />
        <span className="field__hint">The imported chat bot is created as a new draft in this workspace.</span>
      </label>
      {error && <p className="alert">{error}</p>}
    </Dialog>
  );
};
