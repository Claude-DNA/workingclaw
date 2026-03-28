import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/auth";
import { operatorSettingsSchema } from "@/lib/validation";

/**
 * GET /api/operators/:id — Get operator dashboard data
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { operator } = await requireOperator();
    const { id } = await params;

    if (operator.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [recentTasks, earnings30d, certifications] = await Promise.all([
      prisma.task.findMany({
        where: { operatorId: id },
        include: {
          category: { select: { displayName: true } },
          rating: { select: { score: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.task.aggregate({
        where: {
          operatorId: id,
          status: "ACCEPTED",
          acceptedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _sum: { operatorPayout: true },
        _count: true,
      }),
      prisma.certification.findMany({
        where: { operatorId: id },
        include: { category: { select: { displayName: true, name: true } } },
      }),
    ]);

    return NextResponse.json({
      operator: {
        id: operator.id,
        status: operator.status,
        displayName: operator.displayName,
        qualityScore: operator.qualityScore,
        totalTasksCompleted: operator.totalTasksCompleted,
        totalEarnings: operator.totalEarnings,
        currentLoad: operator.currentLoad,
        maxConcurrent: operator.maxConcurrent,
        isOnline: operator.isOnline,
      },
      recentTasks,
      earnings30d: {
        amount: earnings30d._sum.operatorPayout || 0,
        taskCount: earnings30d._count,
      },
      certifications,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/operators/:id — Update operator settings
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { operator } = await requireOperator();
    const { id } = await params;

    if (operator.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data = operatorSettingsSchema.parse(body);

    const updated = await prisma.operator.update({
      where: { id },
      data: {
        displayName: data.displayName,
        hardwareDescription: data.hardwareDescription,
        maxConcurrent: data.maxConcurrent,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
