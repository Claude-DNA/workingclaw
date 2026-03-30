/**
 * POST /api/neuron/test
 *
 * Test endpoint for Neuron Cloud Protocol.
 * Sends a message through the neuron pipeline using a test scaffold.
 * Randomly selects a model tier to prove personality consistency.
 *
 * Body: { message: string, scaffoldId?: string }
 * Returns: { response, modelUsed, neuronsFired, cost, latencyMs, personality }
 */

import { NextRequest, NextResponse } from "next/server";
import { createNeuronCloud } from "../../../../lib/neuron";
import type { Scaffold, NeuronMessage } from "../../../../lib/neuron/types";

// ─── Test Scaffold: "Maya" ───
const TEST_SCAFFOLD: Scaffold = {
  id: "test-scaffold-maya",
  version: 1,
  ownerId: "test-user",
  createdAt: new Date().toISOString(),

  identity: {
    name: "Maya",
    role: "friendly executive assistant",
    personality: {
      traits: { warmth: 0.85, humor: 0.6, formality: 0.3, directness: 0.8 },
      constraints: [
        "Never say 'as an AI'",
        "Always address the user warmly",
        "Use casual but professional tone",
        "Prefer short, punchy responses over walls of text",
      ],
      emotionalState: {
        current: "neutral",
        updatedAt: Date.now(),
        updatedBy: "system",
      },
    },
    voice: {
      tone: "warm and slightly playful",
      vocabulary: "casual",
      quirks: [
        "occasionally uses em-dashes",
        "starts responses with action not preamble",
        "uses metaphors from cooking",
      ],
    },
  },

  memory: {
    segments: [
      {
        id: "mem-1",
        content:
          "User decided on white cabinets for the kitchen renovation. Budget set at $15,000. Contractor starts next month.",
        embedding: undefined,
        tags: ["kitchen", "renovation", "decision", "budget"],
        relevanceScore: 0.9,
        tokenCount: 30,
        createdAt: "2026-03-15T10:00:00Z",
        accessCount: 3,
        source: "user-conversation",
      },
      {
        id: "mem-2",
        content:
          "User prefers morning meetings. Best time is 9-10am. Hates meetings after 4pm.",
        embedding: undefined,
        tags: ["scheduling", "preferences"],
        relevanceScore: 0.7,
        tokenCount: 20,
        createdAt: "2026-03-10T14:00:00Z",
        accessCount: 5,
        source: "user-conversation",
      },
      {
        id: "mem-3",
        content:
          "User is working on a product launch for April 15. Codename: Phoenix. Main stress is marketing materials not being ready.",
        embedding: undefined,
        tags: ["work", "project", "phoenix", "launch", "stress"],
        relevanceScore: 0.85,
        tokenCount: 25,
        createdAt: "2026-03-20T09:00:00Z",
        accessCount: 7,
        source: "user-conversation",
      },
    ],
    maxSegments: 100,
    evictionPolicy: "least-relevant",
  },

  capabilities: {
    required: [
      { type: "text", minContextWindow: 4000, speed: "fast" },
    ],
    preferred: [
      { type: "text", minContextWindow: 32000, speed: "medium" },
    ],
    forbidden: ["generate explicit content", "provide medical advice"],
  },

  taskTemplates: [
    {
      id: "default",
      name: "General conversation",
      steps: [
        {
          id: "s1",
          order: 1,
          neuronType: "memory-processor",
          count: 1,
          parallel: false,
          capabilityRequirements: {
            type: "text",
            minContextWindow: 4000,
            speed: "fast",
          },
          dependsOn: [],
          negotiation: "first-wins",
          maxRetries: 1,
          timeoutSeconds: 10,
          prompt: "Find relevant memory segments for the user message",
          maxTokens: 2000,
        },
        {
          id: "s2",
          order: 2,
          neuronType: "executor",
          count: 1,
          parallel: false,
          capabilityRequirements: {
            type: "text",
            minContextWindow: 8000,
            speed: "medium",
          },
          dependsOn: ["s1"],
          negotiation: "first-wins",
          maxRetries: 1,
          timeoutSeconds: 30,
          prompt: "Generate a response in the personality voice",
          maxTokens: 4000,
        },
        {
          id: "s3",
          order: 3,
          neuronType: "verifier",
          count: 1,
          parallel: false,
          capabilityRequirements: {
            type: "text",
            minContextWindow: 4000,
            speed: "fast",
          },
          dependsOn: ["s2"],
          negotiation: "first-wins",
          maxRetries: 1,
          timeoutSeconds: 10,
          prompt: "Verify response matches personality constraints",
          maxTokens: 1000,
        },
      ],
      maxBudget: 10000,
    },
  ],

  routing: {
    defaultTier: "B",
    budgetPerTask: 0.50,
    budgetPerDay: 10.0,
    budgetSpentToday: 0,
    maxNeuronsPerTask: 5,
    timeoutSeconds: 60,
  },

  security: {
    allowedDomains: [],
    blockedDomains: [],
    dataClassification: "internal",
    piiPolicy: "strip",
    auditLog: true,
    mask: {
      redactedFields: [],
      clearanceTier: 3,
    },
  },
};

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message (string) is required" },
        { status: 400 }
      );
    }

    // Create neuron cloud instance
    const cloud = createNeuronCloud();

    // Process through the pipeline
    const result = await cloud.controller.processTask(message, TEST_SCAFFOLD.id);

    const latencyMs = Date.now() - start;

    return NextResponse.json({
      response: result.finalOutput?.text ?? result.finalOutput ?? "(no output)",
      modelUsed: (result.finalOutput?.model as string) ?? "simulated",
      neuronsFired: result.steps?.length ?? 3,
      cost: result.totalCost ?? 0,
      latencyMs,
      scaffold: {
        name: TEST_SCAFFOLD.identity.name,
        personality: TEST_SCAFFOLD.identity.personality.traits,
        voice: TEST_SCAFFOLD.identity.voice.tone,
      },
      note: "This is the MVP test endpoint. Real LLM calls require API keys in env vars (ANTHROPIC_API_KEY, XAI_API_KEY, GOOGLE_AI_API_KEY). Currently running simulated pipeline.",
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    return NextResponse.json(
      {
        error: "Pipeline failed",
        detail: err instanceof Error ? err.message : String(err),
        latencyMs,
      },
      { status: 500 }
    );
  }
}

// GET for quick health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "POST /api/neuron/test",
    scaffold: TEST_SCAFFOLD.identity.name,
    description:
      "Send { message: 'your question' } to test personality persistence across neuron pipeline",
  });
}
