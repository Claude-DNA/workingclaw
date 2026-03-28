import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

/**
 * Stripe webhook handler
 * Handles: payment confirmation, identity verification, connect account updates
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const taskId = pi.metadata.taskId;
      if (taskId) {
        await prisma.payment.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: { status: "ESCROWED", escrowedAt: new Date() },
        });
      }
      break;
    }

    case "identity.verification_session.verified": {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      const operatorId = session.metadata?.operatorId;
      if (operatorId) {
        await prisma.operator.update({
          where: { id: operatorId },
          data: {
            verificationStatus: "VERIFIED",
            verifiedAt: new Date(),
            status: "CERTIFYING", // Move to certification phase
          },
        });
      }
      break;
    }

    case "identity.verification_session.requires_input": {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      const operatorId = session.metadata?.operatorId;
      if (operatorId) {
        await prisma.operator.update({
          where: { id: operatorId },
          data: { verificationStatus: "FAILED" },
        });
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const operator = await prisma.operator.findUnique({
        where: { stripeConnectId: account.id },
      });
      if (operator) {
        const payoutsEnabled = account.payouts_enabled || false;
        await prisma.operator.update({
          where: { id: operator.id },
          data: { stripePayoutsEnabled: payoutsEnabled },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
