import { type ReactNode, useState } from "react";
import { errorMessage } from "../../../api/http";
import { Dialog } from "./Dialog";

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export const ConfirmDialog = ({ title, message, confirmLabel, isDestructive, onConfirm, onClose }: Props) => {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    setIsBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setIsBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${isDestructive ? "btn--danger" : "btn--primary"}`}
            onClick={confirm}
            disabled={isBusy}
          >
            {isBusy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
      {error && <p className="alert">{error}</p>}
    </Dialog>
  );
};
