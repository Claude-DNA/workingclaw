import { v4 as uuid } from 'uuid';
import type {
  Scaffold,
  MemorySegment,
  ContextInjection,
  PersonalityConfig,
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

    const scaffold: Scaffold = {
      id: scaffoldId,
      version: '0.1.0',
      ownerId: 'system',
      identity: {
        personality: {
          traits: { helpfulness: 0.9, creativity: 0.7, precision: 0.85 },
          constraints: ['Stay on topic', 'No harmful content'],
          emotionalState: 'neutral',
        },
        voice: 'professional',
      },
      memory: {
        segments: [
          {
            id: uuid(),
            content: 'The user prefers concise, actionable responses.',
            tags: ['preference', 'communication'],
            relevanceScore: 0.8,
            tokenCount: 12,
          },
          {
            id: uuid(),
            content: 'Previous task involved marketplace listing creation.',
            tags: ['history', 'marketplace'],
            relevanceScore: 0.6,
            tokenCount: 10,
          },
          {
            id: uuid(),
            content: 'User is building a freelancer platform called WorkingClaw.',
            tags: ['context', 'project', 'marketplace'],
            relevanceScore: 0.95,
            tokenCount: 14,
          },
        ],
      },
      capabilities: [
        { name: 'text-generation', description: 'Generate text responses', maxTokens: 4096 },
        { name: 'code-generation', description: 'Generate code snippets', maxTokens: 8192 },
        { name: 'analysis', description: 'Analyse data and text', maxTokens: 4096 },
      ],
      taskTemplates: [
        {
          id: 'default-pipeline',
          name: 'Default Sequential Pipeline',
          steps: [
            { order: 0, neuronType: 'memory-processor', prompt: 'Retrieve relevant memories', maxTokens: 1024 },
            { order: 1, neuronType: 'memory-injector', prompt: 'Compile context injection', maxTokens: 512 },
            { order: 2, neuronType: 'executor', prompt: 'Execute primary task', maxTokens: 4096 },
            { order: 3, neuronType: 'verifier', prompt: 'Verify output quality', maxTokens: 1024 },
          ],
          maxBudget: 8000,
        },
      ],
      routing: {
        budgets: { free: 2000, standard: 8000, premium: 32000 },
        tiers: { free: 'low', standard: 'normal', premium: 'high' },
      },
      security: {
        redactedFields: ['password', 'secret', 'token'],
        clearanceTier: 3,
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
      securityMask: scaffold.security,
    };
  }

  /** Update the emotional state of a scaffold's personality. */
  updateEmotionalState(scaffoldId: string, newState: string): void {
    const scaffold = this.scaffolds.get(scaffoldId);
    if (scaffold) {
      scaffold.identity.personality.emotionalState = newState;
    }
  }

  /** Store or replace a scaffold. */
  save(scaffold: Scaffold): void {
    this.scaffolds.set(scaffold.id, scaffold);
  }
}
