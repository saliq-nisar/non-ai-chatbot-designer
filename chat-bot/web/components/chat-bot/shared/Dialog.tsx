import { type ReactNode, useEffect, useRef } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
};

/** Modal built on the native <dialog> element (focus trap, Escape and backdrop for free). */
export const Dialog = ({ title, onClose, children, footer, width }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      style={width ? { width: `min(${width}, calc(100vw - 32px))` } : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog__header">
        <h2 className="dialog__title">{title}</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="dialog__body">{children}</div>
      {footer && <div className="dialog__footer">{footer}</div>}
    </dialog>
  );
};
