import { type MouseEvent, useEffect, useState } from "react";

const copyWithSelection = (text: string, near: HTMLElement) => {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
  // Inside the element's own container so it works within a modal <dialog>.
  (near.parentElement ?? document.body).appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    near.focus();
  }
};

export const CopyButton = ({ text, label = "Copy" }: { text: string; label?: string }) => {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget; // React clears currentTarget once the handler awaits
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // The Clipboard API is missing on plain-HTTP sites (and can be blocked): copy through a hidden text field.
      setStatus(copyWithSelection(text, button) ? "copied" : "failed");
    }
  };

  return (
    <button type="button" className="btn btn--primary" onClick={copy}>
      {status === "copied" ? "Copied!" : status === "failed" ? "Copy failed — select the text" : label}
    </button>
  );
};
