import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { rateTaskSchema } from "@/lib/validation";
import { releaseEscrow } from "@/lib/stripe";
import { updateMatchWeights, } from "@/lib/matching";

/**
 * GET /api/tasks/:id — Get task details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        category: true,
        rating: true,
        dispute: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Customers see their own tasks, operators see assigned tasks
    if (task.customerId !== user.id && task.operatorId !== user.operator?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/tasks/:id/accept — Customer accepts the result
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const action = body.action as string;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { payment: true, operator: true },
    });

    if (!task || task.customerId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "accept") {
      if (task.status !== "COMPLETED") {
        return NextResponse.json(
          { error: "Task not in completable state" },
          { status: 400 }
        );
      }

      // Release escrow payment
      if (task.payment?.stripePaymentIntentId) {
        await releaseEscrow(task.payment.stripePaymentIntentId);
      }

      await prisma.task.update({
        where: { id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      if (task.payment) {
        await prisma.payment.update({
          where: { id: task.payment.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      }

      return NextResponse.json({ status: "accepted" });
    }

    if (action === "rate") {
      const rating = rateTaskSchema.parse(body);

      await prisma.rating.create({
        data: {
          taskId: id,
          userId: user.id,
          score: rating.score,
          comment: rating.comment,
        },
      });

      // Update operator quality metrics
      if (task.operatorId) {
        const allRatings = await prisma.rating.findMany({
          where: { task: { operatorId: task.operatorId } },
          select: { score: true },
          orderBy: { createdAt: "desc" },
          take: 100, // Rolling window
        });

        const avgScore =
          allRatings.reduce((sum: number, r: { score: number }) => sum + r.score, 0) / allRatings.length;

        await prisma.operator.update({
          where: { id: task.operatorId },
          data: { qualityScore: avgScore },
        });

        // Update adaptive matching weights
        await updateMatchWeights(
          task.operatorId,
          task.categoryId,
          rating.score,
          task.processingTime || 60
        );
      }

      return NextResponse.json({ status: "rated" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Task action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
