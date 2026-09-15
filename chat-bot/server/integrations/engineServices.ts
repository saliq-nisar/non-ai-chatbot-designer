import type { EngineServices } from "../engine/types.js";
import { runGmail, runSmtpEmail } from "./email.js";
import { runGoogleSheets } from "./googleSheets.js";
import { runHttpRequest } from "./httpRequest.js";
import { createPaymentIntent } from "./stripe.js";

/** The engine's side effects: integration blocks and input preparation. */
export const engineServices: EngineServices = {
  runIntegration: (block, context) => {
    switch (block.type) {
      case "Webhook":
      case "Zapier":
      case "Make.com":
      case "Pabbly":
        return runHttpRequest(block, context);
      case "Email":
        return runSmtpEmail(block, context);
      case "Google Sheets":
        return runGoogleSheets(block, context);
      case "gmail":
        return runGmail(block, context);
      default:
        return Promise.resolve({});
    }
  },

  prepareInput: async (block, context) => {
    if (block.type !== "payment input") return {};
    return { runtimeOptions: await createPaymentIntent(block, context) };
  },
};
