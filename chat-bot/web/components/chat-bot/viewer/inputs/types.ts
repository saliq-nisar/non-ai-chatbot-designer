import type { ChatInput } from "../../../../api/types";
import type { ChatAnswer } from "../../runtime/chatSession";

export type InputProps = {
  input: ChatInput;
  onAnswer: (answer: ChatAnswer) => void;
  /** Answer an optional input without a value (shown as `label`). */
  onSkip: (label: string) => void;
  /** Uploads files for a file input; resolves to the answer value (the file URLs). */
  uploadFiles: (files: File[]) => Promise<string>;
};
