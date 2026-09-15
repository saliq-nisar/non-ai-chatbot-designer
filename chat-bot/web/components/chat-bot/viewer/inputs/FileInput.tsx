import { type DragEvent, useRef, useState } from "react";
import { errorMessage } from "../../../../api/http";
import { chatText } from "../chatText";
import type { InputProps } from "./types";

type FileOptions = {
  isRequired?: boolean;
  isMultipleAllowed?: boolean;
  labels?: { placeholder?: string; button?: string; clear?: string; skip?: string; success?: { single?: string; multiple?: string } };
  allowedFileTypes?: { isEnabled?: boolean; types?: string[] };
};

/** Placeholders may contain simple HTML from existing bots; only text is shown. */
const plainText = (html: string | undefined) => html?.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export const FileInput = ({ input, onAnswer, onSkip, uploadFiles }: InputProps) => {
  const options = (input.options ?? {}) as FileOptions;
  const labels = options.labels ?? {};
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = options.allowedFileTypes?.isEnabled ? options.allowedFileTypes.types?.map((type) => (type.startsWith(".") ? type : `.${type}`)).join(",") : undefined;

  const choose = (list: FileList | null) => {
    if (!list?.length) return;
    setError(undefined);
    setFiles(options.isMultipleAllowed ? [...files, ...Array.from(list)] : [list[0]!]);
  };

  const upload = async () => {
    setIsUploading(true);
    setError(undefined);
    try {
      const value = await uploadFiles(files);
      const label =
        files.length > 1
          ? (labels.success?.multiple ?? chatText.file.multipleSuccess).replace("{total}", String(files.length))
          : (labels.success?.single ?? chatText.file.singleSuccess);
      onAnswer({ value, label });
    } catch (err) {
      setError(errorMessage(err));
      setIsUploading(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    choose(event.dataTransfer.files);
  };

  return (
    <div className="chat__answer chat__answer--column">
      <button
        type="button"
        className={`chat__dropzone${isDragging ? " is-dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        disabled={isUploading}
      >
        {files.length ? files.map((file) => file.name).join(", ") : (plainText(labels.placeholder) ?? chatText.file.placeholder)}
      </button>
      <input ref={inputRef} type="file" hidden multiple={options.isMultipleAllowed} accept={accept} onChange={(e) => choose(e.target.files)} />
      {error && <span className="chat__field-error">{error}</span>}
      <div className="chat__row-actions">
        {options.isRequired === false && !files.length && (
          <button type="button" className="chat__choice" onClick={() => onSkip(labels.skip ?? chatText.file.skip)}>
            {labels.skip ?? chatText.file.skip}
          </button>
        )}
        {files.length > 0 && (
          <button type="button" className="chat__choice" onClick={() => setFiles([])} disabled={isUploading}>
            {labels.clear ?? chatText.file.clear}
          </button>
        )}
        <button type="button" className="chat__button" disabled={!files.length || isUploading} onClick={upload}>
          {isUploading ? chatText.file.uploading : (labels.button ?? chatText.file.button)}
        </button>
      </div>
    </div>
  );
};
