import { type FormEvent, useEffect, useRef, useState } from "react";
import { chatText } from "../chatText";
import type { InputProps } from "./types";

/**
 * Stripe payment input. The server created the PaymentIntent (runtimeOptions); this loads
 * Stripe.js from js.stripe.com, shows Stripe's Payment Element and confirms the payment.
 * The answer sent to the flow is the success label; "fail" is never sent from here.
 */

type RuntimeOptions = { paymentIntentSecret: string; publicKey: string; amountLabel: string };
type PaymentOptions = {
  labels?: { button?: string; success?: string };
  additionalInformation?: { name?: string; email?: string; phoneNumber?: string; address?: Record<string, string | undefined> };
};

type StripeElements = { create: (type: "payment", options?: object) => { mount: (element: HTMLElement) => void; destroy: () => void } };
type StripeInstance = {
  elements: (options: { clientSecret: string }) => StripeElements;
  confirmPayment: (options: { elements: StripeElements; confirmParams: object; redirect: "if_required" }) => Promise<{ error?: { message?: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publicKey: string) => StripeInstance;
  }
}

let stripeScript: Promise<void> | undefined;
const loadStripe = () =>
  (stripeScript ??= new Promise<void>((resolve, reject) => {
    if (window.Stripe) return resolve();
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve();
    script.onerror = () => {
      stripeScript = undefined;
      reject(new Error("Could not load Stripe"));
    };
    document.head.appendChild(script);
  }));

export const PaymentInput = ({ input, onAnswer }: InputProps) => {
  const runtime = input.runtimeOptions as RuntimeOptions | undefined;
  const options = (input.options ?? {}) as PaymentOptions;
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<{ stripe: StripeInstance; elements: StripeElements }>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!runtime) return;
    let element: ReturnType<StripeElements["create"]> | undefined;
    let isCurrent = true;
    loadStripe()
      .then(() => {
        if (!isCurrent || !mountRef.current || !window.Stripe) return;
        const stripe = window.Stripe(runtime.publicKey);
        const elements = stripe.elements({ clientSecret: runtime.paymentIntentSecret });
        element = elements.create("payment", { layout: "tabs" });
        element.mount(mountRef.current);
        stripeRef.current = { stripe, elements };
        setIsReady(true);
      })
      .catch((err: Error) => isCurrent && setError(err.message));
    return () => {
      isCurrent = false;
      element?.destroy();
    };
  }, [runtime]);

  if (!runtime) return <div className="chat__status">{chatText.unsupportedInput}</div>;

  const pay = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripeRef.current) return;
    setIsPaying(true);
    setError(undefined);
    const info = options.additionalInformation ?? {};
    const { error: paymentError } = await stripeRef.current.stripe.confirmPayment({
      elements: stripeRef.current.elements,
      redirect: "if_required",
      confirmParams: {
        return_url: window.location.href,
        payment_method_data: {
          billing_details: {
            name: info.name || undefined,
            email: info.email || undefined,
            phone: info.phoneNumber || undefined,
            address: info.address
              ? { line1: info.address.line1, line2: info.address.line2, city: info.address.city, state: info.address.state, country: info.address.country, postal_code: info.address.postalCode }
              : undefined,
          },
        },
      },
    });
    if (paymentError) {
      setError(paymentError.message ?? "Payment failed");
      setIsPaying(false);
      return;
    }
    onAnswer({ value: options.labels?.success ?? chatText.payment.success });
  };

  return (
    <form className="chat__answer chat__answer--column chat__payment" onSubmit={pay}>
      <div ref={mountRef} className="chat__payment-element" />
      {!isReady && !error && <span className="chat__status">{chatText.payment.loading}</span>}
      {error && <span className="chat__field-error">{error}</span>}
      <button type="submit" className="chat__button" disabled={!isReady || isPaying}>
        {options.labels?.button ?? chatText.payment.button} {runtime.amountLabel}
      </button>
    </form>
  );
};
