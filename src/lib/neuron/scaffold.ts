import { v4 as uuid } from 'uuid';
import type {
  Scaffold,
  MemorySegment,
  ContextInjection,
  PersonalityConfig,
  VoiceConfig,
  CapabilityRequirement,
} from './types';

/**
 * Manages scaffold lifecycle — loading, memory queries, context compilation.
 * In-memory storage for MVP.
 */
export class ScaffoldManager {
  private scaffolds = new Map<string, Scaffold>();

  /** Load a scaffold by id. Returns mock data if none exists yet. */
  loadScaffold(scaffoldId: string): Scaffold {
    const existing = this.scaffolds.get(scaffoldId);
    if (existing) return existing;

    const defaultCapReq: CapabilityRequirement = {
      type: 'text',
      minContextWindow: 4096,
      speed: 'fast',
    };

    const scaffold: Scaffold = {
      id: scaffoldId,
      version: 1,
      ownerId: 'system',
      createdAt: new Date().toISOString(),
      identity: {
        name: 'DefaultAssistant',
        role: 'general-purpose assistant',
        personality: {
          traits: { helpfulness: 0.9, creativity: 0.7, precision: 0.85 },
          constraints: ['Stay on topic', 'No harmful content'],
          emotionalState: { current: 'neutral', updatedAt: Date.now(), updatedBy: 'system' },
        },
        voice: { tone: 'professional', vocabulary: 'mixed', quirks: [] },
      },
      memory: {
        segments: [
          {
            id: uuid(),
            content: 'The user prefers concise, actionable responses.',
            tags: ['preference', 'communication'],
            relevanceScore: 0.8,
            tokenCount: 12,
            createdAt: new Date().toISOString(),
            accessCount: 0,
            source: 'user-conversation',
          },
          {
            id: uuid(),
            content: 'Previous task involved marketplace listing creation.',
            tags: ['history', 'marketplace'],
            relevanceScore: 0.6,
            tokenCount: 10,
            createdAt: new Date().toISOString(),
            accessCount: 0,
            source: 'task-result',
          },
          {
            id: uuid(),
            content: 'User is building a freelancer platform called WorkingClaw.',
            tags: ['context', 'project', 'marketplace'],
            relevanceScore: 0.95,
            tokenCount: 14,
            createdAt: new Date().toISOString(),
            accessCount: 0,
            source: 'user-conversation',
          },
        ],
        maxSegments: 100,
        evictionPolicy: 'least-relevant',
      },
      capabilities: {
        required: [{ type: 'text', minContextWindow: 4096, speed: 'fast' }],
        preferred: [{ type: 'code', minContextWindow: 8192, speed: 'medium' }],
        forbidden: ['execute-arbitrary-shell'],
      },
      taskTemplates: [
        {
          id: 'default-pipeline',
          name: 'Default Sequential Pipeline',
          steps: [
            { id: 'step-mem-proc', order: 0, neuronType: 'memory-processor', prompt: 'Retrieve relevant memories', maxTokens: 1024, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: [], negotiation: 'first-wins', maxRetries: 1, timeoutSeconds: 30 },
            { id: 'step-mem-inj', order: 1, neuronType: 'memory-injector', prompt: 'Compile context injection', maxTokens: 512, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: ['step-mem-proc'], negotiation: 'first-wins', maxRetries: 1, timeoutSeconds: 30 },
            { id: 'step-exec', order: 2, neuronType: 'executor', prompt: 'Execute primary task', maxTokens: 4096, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: ['step-mem-inj'], negotiation: 'first-wins', maxRetries: 2, timeoutSeconds: 60 },
            { id: 'step-verify', order: 3, neuronType: 'verifier', prompt: 'Verify output quality', maxTokens: 1024, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: ['step-exec'], negotiation: 'first-wins', maxRetries: 1, timeoutSeconds: 30 },
          ],
          maxBudget: 8000,
        },
      ],
      routing: {
        defaultTier: 'B',
        budgetPerTask: 8000,
        budgetPerDay: 100000,
        budgetSpentToday: 0,
        maxNeuronsPerTask: 4,
        timeoutSeconds: 300,
      },
      security: {
        allowedDomains: ['*'],
        blockedDomains: [],
        dataClassification: 'internal',
        piiPolicy: 'strip',
        auditLog: true,
        mask: {
          redactedFields: ['password', 'secret', 'token'],
          clearanceTier: 3,
        },
      },
    };

    this.scaffolds.set(scaffoldId, scaffold);
    return scaffold;
  }

  /**
   * Find memory segments whose tags match the query string.
   * Simple substring match on tags for MVP.
   */
  getMemorySegments(scaffoldId: string, query: string): MemorySegment[] {
    const scaffold = this.scaffolds.get(scaffoldId);
    if (!scaffold) return [];

    const lower = query.toLowerCase();
    return scaffold.memory.segments
      .filter((seg) => seg.tags.some((tag) => tag.toLowerCase().includes(lower)))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /** Compile a full context injection for an executor step. */
  compileContextInjection(scaffoldId: string, query: string): ContextInjection {
    const scaffold = this.loadScaffold(scaffoldId);
    const memories = this.getMemorySegments(scaffoldId, query);

    return {
      memories,
      personality: scaffold.identity.personality,
      securityMask: scaffold.security.mask,
    };
  }

  /** Update the emotional state of a scaffold's personality. */
  updateEmotionalState(scaffoldId: string, newState: string): void {
    const scaffold = this.scaffolds.get(scaffoldId);
    if (scaffold) {
      scaffold.identity.personality.emotionalState = {
        current: newState,
        updatedAt: Date.now(),
        updatedBy: 'system',
      };
    }
  }

  /** Store or replace a scaffold. */
  save(scaffold: Scaffold): void {
    this.scaffolds.set(scaffold.id, scaffold);
  }
}
