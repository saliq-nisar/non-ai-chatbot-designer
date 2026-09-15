import { useEffect, useState } from "react";

export const CopyButton = ({ text, label = "Copy" }: { text: string; label?: string }) => {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <button type="button" className="btn btn--primary" onClick={copy}>
      {status === "copied" ? "Copied!" : status === "failed" ? "Copy failed — select the text" : label}
    </button>
  );
};
