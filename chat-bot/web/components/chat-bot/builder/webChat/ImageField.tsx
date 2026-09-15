import { useId, useRef, useState } from "react";
import { chatBotApi } from "../../../../api/chatBotApi";
import { errorMessage } from "../../../../api/http";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  chatBotId: string;
  hint?: string;
};

/** Image picked by URL or uploaded to this server (png, jpg, gif, webp, svg — up to 2 MB). */
export const ImageField = ({ label, value, onChange, chatBotId, hint }: Props) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setIsUploading(true);
    setError(undefined);
    try {
      onChange(await chatBotApi.uploadImage(chatBotId, file));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="image-field">
        <div className="image-field__preview">{value ? <img src={value} alt="" /> : <span>None</span>}</div>
        <div className="image-field__controls">
          <input id={id} className="input" placeholder="https://… or upload" value={value} onChange={(e) => onChange(e.target.value)} />
          <div className="field--inline">
            <button type="button" className="btn btn--sm" onClick={() => inputRef.current?.click()} disabled={isUploading}>
              {isUploading ? "Uploading…" : "Upload image"}
            </button>
            {value && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange("")}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {hint && <span className="field__hint">{hint}</span>}
      {error && <span className="field__hint alert">{error}</span>}
    </div>
  );
};
