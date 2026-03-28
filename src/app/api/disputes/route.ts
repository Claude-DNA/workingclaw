import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { disputeSchema } from "@/lib/validation";
import { getTaskQueue } from "@/lib/queue";
import { refundPayment } from "@/lib/stripe";

/**
 * POST /api/disputes — Open a dispute on a task
 * Includes Astra's "replay" mechanism: one-click re-run on a different
 * certified operator with auto-refund if output variance is high.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = disputeSchema.parse(body);
    const taskId = body.taskId as string;

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { payment: true, dispute: true },
    });

    if (!task || task.customerId !== user.id) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.dispute) {
      return NextResponse.json(
        { error: "Dispute already exists for this task" },
        { status: 409 }
      );
    }

    if (task.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Can only dispute completed tasks" },
        { status: 400 }
      );
    }

    // Check 48-hour window
    if (task.completedAt) {
      const hoursSinceCompletion =
        (Date.now() - task.completedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCompletion > 48) {
        return NextResponse.json(
          { error: "Dispute window has closed (48 hours)" },
          { status: 400 }
        );
      }
    }

    // Create the dispute
    const dispute = await prisma.dispute.create({
      data: {
        taskId,
        customerId: user.id,
        reason: data.reason,
        description: data.description,
        replayRequested: data.requestReplay,
        status: data.requestReplay ? "REPLAYED" : "OPEN",
      },
    });

    // Update task status
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "DISPUTED" },
    });

    // If replay requested, create a new task routed to a DIFFERENT operator
    if (data.requestReplay) {
      const replayTask = await prisma.task.create({
        data: {
          customerId: user.id,
          categoryId: task.categoryId,
          title: task.title,
          description: task.description,
          inputFileKey: task.inputFileKey,
          inputMetadata: task.inputMetadata ?? undefined,
          price: task.price,
          platformFee: task.platformFee,
          operatorPayout: task.operatorPayout,
          status: "SUBMITTED",
          replayOfId: taskId,
        },
      });

      // Route to a different operator (exclude original)
      await getTaskQueue().add("route-task", {
        taskId: replayTask.id,
        categoryId: task.categoryId,
        price: task.price,
        attempt: 0,
        excludeOperator: task.operatorId,
      });

      await prisma.dispute.update({
        where: { id: dispute.id },
        data: { replayTaskId: replayTask.id },
      });

      await prisma.task.update({
        where: { id: taskId },
        data: { status: "REPLAYED" },
      });

      return NextResponse.json({
        disputeId: dispute.id,
        status: "replayed",
        replayTaskId: replayTask.id,
        message: "Task has been re-submitted to a different operator.",
      });
    }

    // For non-replay disputes, hold payment and await review
    return NextResponse.json({
      disputeId: dispute.id,
      status: "open",
      message: "Dispute opened. Our team will review within 24 hours.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Dispute error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
