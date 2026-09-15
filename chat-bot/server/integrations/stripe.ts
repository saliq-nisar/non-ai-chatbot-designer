import type { Block } from "../../shared/types.js";
import { getCredentialsData, type StripeCredentials } from "../db/credentials.js";
import type { Flow, SessionState } from "../engine/types.js";
import { parseVariables } from "../engine/variables.js";
import { HttpError } from "../http.js";

/**
 * Payment input (Stripe): before the input is shown, a PaymentIntent is created with the
 * saved Stripe keys (test keys for Test conversations when available). The chat UI then
 * shows Stripe's payment form with the returned client secret.
 */

type PaymentOptions = {
  credentialsId?: string;
  currency?: string;
  amount?: string;
  additionalInformation?: { description?: string; email?: string };
};

const ZERO_DECIMAL_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export type PaymentRuntimeOptions = { paymentIntentSecret: string; publicKey: string; amountLabel: string };

export const createPaymentIntent = async (block: Block, { state, flow }: { state: SessionState; flow: Flow }): Promise<PaymentRuntimeOptions> => {
  const options = (block.options ?? {}) as PaymentOptions;
  if (!options.credentialsId) throw new HttpError(400, "The payment block has no Stripe account");
  const keys = await getCredentialsData<StripeCredentials>(options.credentialsId, state.workspaceId, "stripe");
  if (!keys) throw new HttpError(400, "Stripe credentials not found");
  const useTestKeys = state.isTest && !!keys.test?.secretKey && !!keys.test?.publicKey;
  const secretKey = useTestKeys ? keys.test.secretKey! : keys.live.secretKey;
  const publicKey = useTestKeys ? keys.test.publicKey! : keys.live.publicKey;

  const currency = (options.currency || "USD").toUpperCase();
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
  const amount = Math.round(Number(parseVariables(options.amount, flow.variables)) * multiplier);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "The payment amount is not a valid number");

  const email = parseVariables(options.additionalInformation?.email, flow.variables);
  const description = parseVariables(options.additionalInformation?.description, flow.variables);
  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      amount: String(amount),
      currency: currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      ...(email ? { receipt_email: email } : {}),
      ...(description ? { description } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as { client_secret?: string; error?: { message?: string } };
  if (!response.ok || !data.client_secret) throw new HttpError(400, `Stripe: ${data.error?.message ?? response.status}`);

  return {
    paymentIntentSecret: data.client_secret,
    publicKey,
    amountLabel: new Intl.NumberFormat(currency === "EUR" ? "fr-FR" : "en-US", { style: "currency", currency }).format(amount / multiplier),
  };
};
