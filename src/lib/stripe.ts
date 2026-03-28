import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Platform fee: 15-20% (start at 18%)
export const PLATFORM_FEE_PERCENT = 0.18;

// Minimum task price: $2.00 (team agreed)
export const MIN_TASK_PRICE_CENTS = 200;

// Escrow acceptance window: 48 hours
export const ESCROW_WINDOW_HOURS = 48;

// Data retention: 7 days after completion (team agreed, not 30)
export const DATA_RETENTION_DAYS = 7;

/**
 * Create a Stripe Connect account for an operator
 */
export async function createConnectAccount(email: string): Promise<string> {
  const account = await getStripe().accounts.create({
    type: "express",
    email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { platform: "workingclaw" },
  });
  return account.id;
}

/**
 * Create onboarding link for operator's Stripe Connect account
 */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string
): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${returnUrl}?refresh=true`,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Create a payment intent with escrow (manual capture)
 */
export async function createEscrowPayment(
  amount: number,
  operatorConnectId: string,
  taskId: string
): Promise<Stripe.PaymentIntent> {
  const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT);

  return getStripe().paymentIntents.create({
    amount,
    currency: "usd",
    capture_method: "manual", // Hold in escrow
    transfer_data: {
      destination: operatorConnectId,
    },
    application_fee_amount: platformFee,
    metadata: {
      taskId,
      platformFee: platformFee.toString(),
      operatorAmount: (amount - platformFee).toString(),
    },
  });
}

/**
 * Release escrow — capture payment and transfer to operator
 */
export async function releaseEscrow(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.capture(paymentIntentId);
}

/**
 * Refund escrowed payment
 */
export async function refundPayment(
  paymentIntentId: string,
  amount?: number
): Promise<Stripe.Refund> {
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  };
  if (amount) params.amount = amount;
  return getStripe().refunds.create(params);
}

/**
 * Create a Stripe Identity verification session
 */
export async function createVerificationSession(
  operatorId: string,
  returnUrl: string
): Promise<Stripe.Identity.VerificationSession> {
  return getStripe().identity.verificationSessions.create({
    type: "document",
    metadata: { operatorId },
    options: {
      document: {
        require_matching_selfie: true,
      },
    },
    return_url: returnUrl,
  });
}
