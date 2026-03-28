/**
 * Zod validation schemas for API inputs
 */

import { z } from "zod";
import { MIN_TASK_PRICE_CENTS } from "./stripe";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(100),
  role: z.enum(["CUSTOMER", "OPERATOR"]).default("CUSTOMER"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const submitTaskSchema = z.object({
  categoryId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  // Price is set by category, validated server-side
});

export const rateTaskSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const disputeSchema = z.object({
  reason: z.enum([
    "LOW_QUALITY",
    "INCOMPLETE",
    "WRONG_OUTPUT",
    "PRIVACY_CONCERN",
    "LATE_DELIVERY",
    "OTHER",
  ]),
  description: z.string().max(2000).optional(),
  requestReplay: z.boolean().default(false),
});

export const operatorSettingsSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  hardwareDescription: z.string().max(500).optional(),
  maxConcurrent: z.number().int().min(1).max(15), // Team agreed: 5-15 realistic
});
