/**
 * Adaptive Task Matching Algorithm
 *
 * Team-agreed architecture:
 * - Weights start at defaults (quality 40%, price 30%, speed 20%, volume 10%)
 * - Feedback loop: after each completed task, weights shift per-category
 *   based on customer satisfaction signals
 * - Navi's input: "if customers consistently prefer operator X for email drafts
 *   but operator Y for summaries, the weights should shift per-category per-customer"
 * - 30-second timeout before re-routing to next operator
 */

import { prisma } from "./prisma";

interface OperatorScore {
  operatorId: string;
  totalScore: number;
  breakdown: {
    quality: number;
    price: number;
    speed: number;
    volume: number;
  };
}

interface MatchResult {
  operatorId: string;
  score: number;
  breakdown: OperatorScore["breakdown"];
}

// Default weights (team agreed)
const DEFAULT_WEIGHTS = {
  quality: 0.4,
  price: 0.3,
  speed: 0.2,
  volume: 0.1,
};

// Routing timeout before trying next operator
export const ROUTE_TIMEOUT_MS = 30_000;

/**
 * Find the best operator for a task.
 * Returns ranked list — caller routes to top, falls back to next on timeout.
 */
export async function matchTask(
  categoryId: string,
  taskPrice: number
): Promise<MatchResult[]> {
  // 1. Get all certified + online + not-at-capacity operators for this category
  const candidates = await prisma.operator.findMany({
    where: {
      status: "ACTIVE",
      isOnline: true,
      certifications: {
        some: {
          categoryId,
          passed: true,
          expiresAt: { gt: new Date() },
        },
      },
    },
    include: {
      certifications: {
        where: { categoryId },
      },
      matchWeights: {
        where: { categoryId },
      },
    },
  });

  // Filter out operators at capacity
  const available = candidates.filter(
    (op) => op.currentLoad < op.maxConcurrent
  );

  if (available.length === 0) return [];

  // 2. Compute normalized scores
  const maxQuality = Math.max(...available.map((op) => op.qualityScore), 1);
  const maxSpeed = Math.max(...available.map((op) => op.avgResponseTime), 1);
  const maxVolume = Math.max(
    ...available.map((op) => op.totalTasksCompleted),
    1
  );

  const scored: OperatorScore[] = available.map((op) => {
    // Use adaptive weights if available, otherwise defaults
    const weights = op.matchWeights[0] || DEFAULT_WEIGHTS;

    // Quality: higher is better (0-5 scale normalized to 0-1)
    const qualityNorm = op.qualityScore / 5;

    // Price: lower operator cost = higher score for customer
    // Operators who charge less of the task price get higher scores
    const priceNorm = 1; // All operators get same price in MVP (platform sets price)

    // Speed: lower response time = higher score
    const speedNorm = maxSpeed > 0 ? 1 - op.avgResponseTime / maxSpeed : 1;

    // Volume: more completed tasks = higher trust signal
    const volumeNorm = op.totalTasksCompleted / maxVolume;

    const totalScore =
      qualityNorm * weights.qualityWeight +
      priceNorm * weights.priceWeight +
      speedNorm * weights.speedWeight +
      volumeNorm * weights.volumeWeight;

    return {
      operatorId: op.id,
      totalScore,
      breakdown: {
        quality: qualityNorm * weights.qualityWeight,
        price: priceNorm * weights.priceWeight,
        speed: speedNorm * weights.speedWeight,
        volume: volumeNorm * weights.volumeWeight,
      },
    };
  });

  // 3. Sort by total score descending
  scored.sort((a, b) => b.totalScore - a.totalScore);

  return scored.map((s) => ({
    operatorId: s.operatorId,
    score: s.totalScore,
    breakdown: s.breakdown,
  }));
}

/**
 * Update adaptive weights after task completion.
 * Called when a customer rates a task — shifts weights toward
 * dimensions that correlated with satisfaction.
 *
 * Learning rate is conservative (0.05) to avoid oscillation.
 */
export async function updateMatchWeights(
  operatorId: string,
  categoryId: string,
  rating: number, // 1-5
  responseTime: number // seconds
): Promise<void> {
  const LEARNING_RATE = 0.05;

  const existing = await prisma.matchWeight.findUnique({
    where: { operatorId_categoryId: { operatorId, categoryId } },
  });

  const weights = existing || {
    qualityWeight: DEFAULT_WEIGHTS.quality,
    priceWeight: DEFAULT_WEIGHTS.price,
    speedWeight: DEFAULT_WEIGHTS.speed,
    volumeWeight: DEFAULT_WEIGHTS.volume,
    sampleSize: 0,
  };

  // If high rating (4-5), boost quality weight slightly
  // If fast response was valued (good rating + fast), boost speed weight
  const satisfaction = (rating - 3) / 2; // -1 to 1 range
  const wasfast = responseTime < 60; // Under 1 minute

  let newQuality = weights.qualityWeight + satisfaction * LEARNING_RATE;
  let newSpeed =
    weights.speedWeight + (wasfast && rating >= 4 ? LEARNING_RATE : 0);
  let newPrice = weights.priceWeight;
  let newVolume = weights.volumeWeight;

  // Normalize so weights sum to 1
  const sum = newQuality + newPrice + newSpeed + newVolume;
  newQuality /= sum;
  newPrice /= sum;
  newSpeed /= sum;
  newVolume /= sum;

  await prisma.matchWeight.upsert({
    where: { operatorId_categoryId: { operatorId, categoryId } },
    create: {
      operatorId,
      categoryId,
      qualityWeight: newQuality,
      priceWeight: newPrice,
      speedWeight: newSpeed,
      volumeWeight: newVolume,
      sampleSize: 1,
    },
    update: {
      qualityWeight: newQuality,
      priceWeight: newPrice,
      speedWeight: newSpeed,
      volumeWeight: newVolume,
      sampleSize: { increment: 1 },
      lastUpdatedAt: new Date(),
    },
  });
}
