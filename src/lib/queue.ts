/**
 * Task Queue — BullMQ + Redis
 *
 * Handles: task routing, 30-second timeout re-routing,
 * escrow release scheduling, data retention cleanup.
 */

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "./prisma";
import { matchTask, ROUTE_TIMEOUT_MS } from "./matching";
import { releaseEscrow } from "./stripe";
import { DATA_RETENTION_DAYS } from "./stripe";

// ============================================================
// LAZY CONNECTION
// ============================================================

let _connection: IORedis | null = null;
function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

// ============================================================
// QUEUES (lazy)
// ============================================================

let _taskQueue: Queue | null = null;
export function getTaskQueue(): Queue {
  if (!_taskQueue) {
    _taskQueue = new Queue("task-routing", { connection: getConnection() });
  }
  return _taskQueue;
}

let _escrowQueue: Queue | null = null;
export function getEscrowQueue(): Queue {
  if (!_escrowQueue) {
    _escrowQueue = new Queue("escrow-release", { connection: getConnection() });
  }
  return _escrowQueue;
}

let _cleanupQueue: Queue | null = null;
export function getCleanupQueue(): Queue {
  if (!_cleanupQueue) {
    _cleanupQueue = new Queue("data-cleanup", { connection: getConnection() });
  }
  return _cleanupQueue;
}

// ============================================================
// TASK ROUTING WORKER (lazy)
// ============================================================

let _taskWorker: Worker | null = null;
export function getTaskWorker(): Worker {
  if (!_taskWorker) {
    _taskWorker = new Worker(
      "task-routing",
      async (job: Job) => {
        const { taskId, categoryId, price, attempt = 0 } = job.data;

        // Get ranked operators
        const matches = await matchTask(categoryId, price);

        if (matches.length === 0) {
          // No operators available — mark as queued, will retry
          if (attempt < 10) {
            await getTaskQueue().add(
              "route-task",
              { taskId, categoryId, price, attempt: attempt + 1 },
              { delay: 30_000 } // Retry in 30 seconds
            );
            return { status: "requeued", attempt: attempt + 1 };
          }

          // After 10 attempts (5 minutes), mark as expired
          await prisma.task.update({
            where: { id: taskId },
            data: { status: "EXPIRED" },
          });
          return { status: "expired" };
        }

        // Route to top-ranked operator
        const selected = matches[attempt % matches.length] || matches[0];

        await prisma.task.update({
          where: { id: taskId },
          data: {
            operatorId: selected.operatorId,
            status: "QUEUED",
            matchedAt: new Date(),
          },
        });

        // Increment operator load
        await prisma.operator.update({
          where: { id: selected.operatorId },
          data: { currentLoad: { increment: 1 } },
        });

        // Set 30-second timeout — if operator doesn't start, re-route
        await getTaskQueue().add(
          "check-timeout",
          { taskId, operatorId: selected.operatorId, attempt },
          { delay: ROUTE_TIMEOUT_MS }
        );

        return { status: "routed", operatorId: selected.operatorId, score: selected.score };
      },
      { connection: getConnection(), concurrency: 10 }
    );
  }
  return _taskWorker;
}

// ============================================================
// TIMEOUT CHECKER (lazy)
// ============================================================

let _timeoutWorker: Worker | null = null;
export function getTimeoutWorker(): Worker {
  if (!_timeoutWorker) {
    _timeoutWorker = new Worker(
      "task-routing",
      async (job: Job) => {
        if (job.name !== "check-timeout") return;

        const { taskId, operatorId, attempt } = job.data;

        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task || task.status !== "QUEUED") return; // Already picked up or cancelled

        // Operator didn't start — decrement their load and re-route
        await prisma.operator.update({
          where: { id: operatorId },
          data: { currentLoad: { decrement: 1 } },
        });

        await prisma.task.update({
          where: { id: taskId },
          data: { operatorId: null, status: "SUBMITTED", matchedAt: null },
        });

        // Re-route with next attempt (skips to next operator in ranking)
        await getTaskQueue().add("route-task", {
          taskId,
          categoryId: task.categoryId,
          price: task.price,
          attempt: attempt + 1,
        });
      },
      { connection: getConnection() }
    );
  }
  return _timeoutWorker;
}

// ============================================================
// ESCROW RELEASE WORKER — auto-release after 48h acceptance window (lazy)
// ============================================================

let _escrowWorker: Worker | null = null;
export function getEscrowWorker(): Worker {
  if (!_escrowWorker) {
    _escrowWorker = new Worker(
      "escrow-release",
      async (job: Job) => {
        const { taskId, paymentIntentId } = job.data;

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { dispute: true },
        });

        if (!task) return;

        // Don't release if disputed
        if (task.status === "DISPUTED" || task.dispute) {
          return { status: "held-dispute" };
        }

        // Auto-accept if 48h window passed without dispute
        if (task.status === "COMPLETED") {
          await releaseEscrow(paymentIntentId);

          await prisma.task.update({
            where: { id: taskId },
            data: { status: "ACCEPTED", acceptedAt: new Date() },
          });

          await prisma.payment.update({
            where: { taskId },
            data: { status: "RELEASED", releasedAt: new Date() },
          });

          return { status: "released" };
        }
      },
      { connection: getConnection() }
    );
  }
  return _escrowWorker;
}

// ============================================================
// DATA CLEANUP WORKER — 7-day retention (team agreed) (lazy)
// ============================================================

let _cleanupWorker: Worker | null = null;
export function getCleanupWorker(): Worker {
  if (!_cleanupWorker) {
    _cleanupWorker = new Worker(
      "data-cleanup",
      async (job: Job) => {
        const { taskId } = job.data;

        // Delete S3 files and clear file keys
        // TODO: integrate with actual S3 client
        await prisma.task.update({
          where: { id: taskId },
          data: {
            inputFileKey: null,
            outputFileKey: null,
            inputMetadata: { set: null } as never, // Prisma JSON null handling
          },
        });

        return { status: "cleaned", taskId };
      },
      { connection: getConnection() }
    );
  }
  return _cleanupWorker;
}

/**
 * Schedule escrow release for 48 hours after task completion
 */
export async function scheduleEscrowRelease(
  taskId: string,
  paymentIntentId: string
): Promise<void> {
  await getEscrowQueue().add(
    "release",
    { taskId, paymentIntentId },
    { delay: 48 * 60 * 60 * 1000 } // 48 hours
  );
}

/**
 * Schedule data cleanup for 7 days after task completion
 */
export async function scheduleDataCleanup(taskId: string): Promise<void> {
  await getCleanupQueue().add(
    "cleanup",
    { taskId },
    { delay: DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000 }
  );
}
