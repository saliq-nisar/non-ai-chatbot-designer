/**
 * Default user-facing chat texts. Values configured on a block in the builder
 * (placeholder, button label…) take precedence.
 */
export const chatText = {
  sendButton: "Send",
  placeholders: {
    "text input": "Type your answer...",
    "number input": "Type a number...",
    "email input": "Type your email...",
    "url input": "Type a URL, including http://...",
    "phone number input": "Type your phone number...",
  } as Record<string, string>,
  dateFrom: "From:",
  dateTo: "To:",
  typing: "Typing…",
  restart: "Restart",
  retry: "Retry",
  unsupportedInput: "This question can't be answered in this chat window.",
  close: "Close chat",
  liveAgentPlaceholder: "Type your message...",
  file: {
    placeholder: "Click to choose a file or drop it here",
    button: "Upload",
    clear: "Clear",
    skip: "Skip",
    uploading: "Uploading…",
    singleSuccess: "File uploaded",
    multipleSuccess: "{total} files uploaded",
  },
  payment: {
    button: "Pay",
    success: "Success",
    loading: "Loading payment form…",
  },
};
