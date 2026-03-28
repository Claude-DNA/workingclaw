import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { submitTaskSchema } from "@/lib/validation";
import { createEscrowPayment, PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { getTaskQueue, scheduleDataCleanup } from "@/lib/queue";

/**
 * POST /api/tasks — Submit a new task
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = submitTaskSchema.parse(body);

    // Get category and validate
    const category = await prisma.taskCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!category || !category.isActive) {
      return NextResponse.json(
        { error: "Invalid or inactive category" },
        { status: 400 }
      );
    }

    // Use suggested price for MVP (customer doesn't haggle)
    const price = category.suggestedPrice;
    const platformFee = Math.round(price * PLATFORM_FEE_PERCENT);
    const operatorPayout = price - platformFee;

    // Create the task
    const task = await prisma.task.create({
      data: {
        customerId: user.id,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        price,
        platformFee,
        operatorPayout,
        status: "SUBMITTED",
      },
    });

    // Add to routing queue
    await getTaskQueue().add("route-task", {
      taskId: task.id,
      categoryId: data.categoryId,
      price,
      attempt: 0,
    });

    return NextResponse.json({
      id: task.id,
      status: task.status,
      price: task.price,
      categoryId: task.categoryId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Task submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks — List user's tasks
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = { customerId: user.id };
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          category: { select: { displayName: true, name: true } },
          rating: { select: { score: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({ tasks, total, limit, offset });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
