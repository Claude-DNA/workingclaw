import { v4 as uuid } from 'uuid';
import type {
  NeuronType,
  NeuronStep,
  ActivePipeline,
  ActiveStep,
  ControllerState,
  BudgetTracker,
  ContextInjection,
  CapabilityRequirement,
} from './types';
import { NeuronMessageBus } from './message-bus';
import { NeuronRegistry } from './registry';
import { ScaffoldManager } from './scaffold';

/** Task classification result */
interface TaskClassification {
  intent: string;
  complexity: 'low' | 'medium' | 'high';
  suggestedBudget: number;
}

/** Final task result returned to caller */
export interface TaskResult {
  taskId: string;
  scaffoldId: string;
  classification: TaskClassification;
  steps: ActiveStep[];
  finalOutput: Record<string, unknown>;
  totalCost: number;
  status: 'complete' | 'failed';
}

/**
 * Controller neuron — orchestrates the full task pipeline.
 *
 * Fixed sequential pipeline for MVP:
 *   classify → memory-process → inject → execute → verify
 */
export class ControllerNeuron {
  private state: ControllerState;

  constructor(
    private bus: NeuronMessageBus,
    private registry: NeuronRegistry,
    private scaffolds: ScaffoldManager
  ) {
    this.state = {
      pipelines: new Map(),
      globalBudget: { allocated: 100_000, consumed: 0, perStep: {} },
    };
  }

  /** Entry point: process a user message through the full pipeline. */
  async processTask(userMessage: string, scaffoldId: string): Promise<TaskResult> {
    const taskId = uuid();
    const scaffold = this.scaffolds.loadScaffold(scaffoldId);

    // 1. Classify
    this.emitLog(taskId, 'controller', 'task:start', { userMessage, scaffoldId });
    const classification = this.classifyTask(userMessage);
    this.emitLog(taskId, 'controller', 'task:classified', { classification });

    // 2. Build pipeline
    const pipeline = this.buildPipeline(taskId, scaffoldId, classification);
    this.state.pipelines.set(taskId, pipeline);
    this.emitLog(taskId, 'controller', 'pipeline:built', {
      steps: pipeline.steps.length,
    });

    // 3. Execute each step sequentially
    for (let i = 0; i < pipeline.steps.length; i++) {
      pipeline.currentStepIndex = i;

      if (!this.enforceBudget(pipeline)) {
        pipeline.status = 'failed';
        this.emitLog(taskId, 'controller', 'pipeline:budget-exceeded', {
          consumed: pipeline.budget.consumed,
          allocated: pipeline.budget.allocated,
        });
        break;
      }

      const activeStep = pipeline.steps[i];
      activeStep.status = 'running';
      activeStep.startedAt = new Date().toISOString();
      this.emitLog(taskId, 'controller', 'step:start', {
        order: activeStep.step.order,
        neuronType: activeStep.step.neuronType,
      });

      const result = await this.executeStep(taskId, scaffoldId, activeStep, userMessage);
      activeStep.result = result;
      activeStep.status = 'complete';
      activeStep.completedAt = new Date().toISOString();

      const stepCost = activeStep.step.maxTokens * 0.1; // simulated cost
      pipeline.budget.consumed += stepCost;
      pipeline.budget.perStep[`step-${i}`] = stepCost;
      this.state.globalBudget.consumed += stepCost;

      this.emitLog(taskId, 'controller', 'step:complete', {
        order: activeStep.step.order,
        neuronType: activeStep.step.neuronType,
        cost: stepCost,
      });

      if (this.shouldScale(pipeline)) {
        this.emitLog(taskId, 'controller', 'pipeline:scale-hint', {
          reason: 'budget utilisation high',
        });
      }
    }

    // 4. Complete
    if (pipeline.status !== 'failed') {
      pipeline.status = 'complete';
    }

    const finalOutput = this.completeTask(pipeline);
    this.emitLog(taskId, 'controller', 'task:complete', {
      status: pipeline.status,
      totalCost: pipeline.budget.consumed,
    });

    return {
      taskId,
      scaffoldId,
      classification,
      steps: pipeline.steps,
      finalOutput,
      totalCost: pipeline.budget.consumed,
      status: pipeline.status,
    };
  }

  /** Classify the user message into an intent + complexity. */
  classifyTask(userMessage: string): TaskClassification {
    const wordCount = userMessage.split(/\s+/).length;
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (wordCount > 50) complexity = 'high';
    else if (wordCount > 15) complexity = 'medium';

    const budgetMap = { low: 2000, medium: 8000, high: 32000 } as const;

    return {
      intent: userMessage.slice(0, 80),
      complexity,
      suggestedBudget: budgetMap[complexity],
    };
  }

  /** Build the fixed sequential pipeline for MVP. */
  buildPipeline(
    taskId: string,
    scaffoldId: string,
    classification: TaskClassification
  ): ActivePipeline {
    const defaultCapReq: CapabilityRequirement = {
      type: 'text',
      minContextWindow: 4096,
      speed: 'fast',
    };

    const steps: NeuronStep[] = [
      { id: 'step-0', order: 0, neuronType: 'memory-processor', prompt: 'Retrieve and rank relevant memories', maxTokens: 1024, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: [], negotiation: 'first-wins', maxRetries: 1, timeoutSeconds: 30 },
      { id: 'step-1', order: 1, neuronType: 'memory-injector', prompt: 'Compile context injection', maxTokens: 512, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: ['step-0'], negotiation: 'first-wins', maxRetries: 1, timeoutSeconds: 30 },
      { id: 'step-2', order: 2, neuronType: 'executor', prompt: 'Execute primary task', maxTokens: 4096, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: ['step-1'], negotiation: 'first-wins', maxRetries: 2, timeoutSeconds: 60 },
      { id: 'step-3', order: 3, neuronType: 'verifier', prompt: 'Verify output quality and safety', maxTokens: 1024, count: 1, parallel: false, capabilityRequirements: defaultCapReq, dependsOn: ['step-2'], negotiation: 'first-wins', maxRetries: 1, timeoutSeconds: 30 },
    ];

    const activeSteps: ActiveStep[] = steps.map((step) => ({
      step,
      status: 'pending',
    }));

    return {
      taskId,
      scaffoldId,
      steps: activeSteps,
      currentStepIndex: 0,
      budget: {
        allocated: classification.suggestedBudget,
        consumed: 0,
        perStep: {},
      },
      status: 'running',
    };
  }

  /** Execute a single pipeline step. Returns the step result payload. */
  async executeStep(
    taskId: string,
    scaffoldId: string,
    activeStep: ActiveStep,
    userMessage: string
  ): Promise<Record<string, unknown>> {
    const { neuronType } = activeStep.step;

    switch (neuronType) {
      case 'memory-processor': {
        const segments = this.scaffolds.getMemorySegments(scaffoldId, userMessage);
        return { retrievedSegments: segments.length, segments };
      }
      case 'memory-injector': {
        const injection = this.scaffolds.compileContextInjection(scaffoldId, userMessage);
        return { injection };
      }
      case 'executor': {
        // MVP: echo-style execution — real LLM integration comes later
        return {
          response: `[Neuron executor] Processed: "${userMessage.slice(0, 120)}"`,
          tokensUsed: activeStep.step.maxTokens,
        };
      }
      case 'verifier': {
        return {
          verified: true,
          qualityScore: 0.85,
          safetyPass: true,
        };
      }
      default:
        return { skipped: true, reason: `No handler for neuron type: ${neuronType}` };
    }
  }

  /** Check whether the pipeline should scale (>80% budget used). */
  shouldScale(pipeline: ActivePipeline): boolean {
    return pipeline.budget.consumed / pipeline.budget.allocated > 0.8;
  }

  /** Enforce budget: returns false if budget is exhausted. */
  enforceBudget(pipeline: ActivePipeline): boolean {
    return pipeline.budget.consumed < pipeline.budget.allocated;
  }

  /** Gather final output from the completed pipeline. */
  private completeTask(pipeline: ActivePipeline): Record<string, unknown> {
    const executorStep = pipeline.steps.find((s) => s.step.neuronType === 'executor');
    const verifierStep = pipeline.steps.find((s) => s.step.neuronType === 'verifier');

    return {
      response: executorStep?.result?.response ?? null,
      verified: verifierStep?.result?.verified ?? false,
      qualityScore: verifierStep?.result?.qualityScore ?? 0,
    };
  }

  // ── helpers ──

  private emitLog(
    taskId: string,
    from: string,
    type: string,
    payload: Record<string, unknown>
  ): void {
    this.bus.publish(
      NeuronMessageBus.createMessage({
        from,
        to: '*',
        type,
        taskId,
        payload,
      })
    );
  }
}
