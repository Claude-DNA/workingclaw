// ─── Neuron Cloud Protocol — Type Definitions ───

/** Union of all neuron roles in the cloud */
export type NeuronType =
  | 'controller'
  | 'memory-processor'
  | 'memory-injector'
  | 'info-search'
  | 'executor'
  | 'verifier'
  | 'synthesis';

/** Priority levels for message routing */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

/** Lifecycle status of a neuron instance */
export type NeuronStatus = 'idle' | 'busy' | 'claimed' | 'error' | 'offline';

// ─── Core Messages ───

/** A message routed through the neuron cloud message bus */
export interface NeuronMessage {
  /** Unique message identifier */
  id: string;
  /** Sender neuron id */
  from: string;
  /** Target neuron id (or '*' for broadcast) */
  to: string;
  /** Semantic message type (e.g. 'task:classify', 'step:complete') */
  type: string;
  /** Associated task id */
  taskId: string;
  /** Arbitrary payload */
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Routing priority */
  priority: MessagePriority;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Optional batch grouping id */
  batchId?: string;
  /** Estimated cost in tokens / credits */
  cost: number;
}

// ─── Neuron Instances ───

/** A single capability a neuron can provide */
export interface Capability {
  /** Machine-readable capability name */
  name: string;
  /** Human description */
  description: string;
  /** Maximum tokens this capability can process per invocation */
  maxTokens: number;
}

/** A registered neuron instance in the cloud */
export interface NeuronInstance {
  /** Unique instance id */
  id: string;
  /** Role of this neuron */
  type: NeuronType;
  /** Current lifecycle status */
  status: NeuronStatus;
  /** Capabilities this instance provides */
  capabilities: Capability[];
  /** Id of task currently claimed, if any */
  currentTaskId: string | null;
  /** ISO-8601 registration time */
  registeredAt: string;
}

// ─── Scaffold (Identity / Memory / Routing) ───

/** Personality configuration embedded in a scaffold */
export interface PersonalityConfig {
  /** Trait name → intensity (0–1) */
  traits: Record<string, number>;
  /** Hard constraints the personality must obey */
  constraints: string[];
  /** Current emotional state label */
  emotionalState: string;
}

/** A discrete segment of long-term memory */
export interface MemorySegment {
  /** Unique segment id */
  id: string;
  /** Raw text content */
  content: string;
  /** Searchable tags */
  tags: string[];
  /** Relevance score (0–1) */
  relevanceScore: number;
  /** Token count of content */
  tokenCount: number;
}

/** A reusable task template stored in a scaffold */
export interface TaskTemplate {
  /** Template id */
  id: string;
  /** Human-readable name */
  name: string;
  /** Ordered neuron steps */
  steps: NeuronStep[];
  /** Maximum budget (tokens) for the full template */
  maxBudget: number;
}

/** A single step within a pipeline or task template */
export interface NeuronStep {
  /** Step ordinal */
  order: number;
  /** Which neuron type handles this step */
  neuronType: NeuronType;
  /** Prompt / instruction for the step */
  prompt: string;
  /** Max tokens allocated to this step */
  maxTokens: number;
}

/** Context injection payload sent to an executor neuron */
export interface ContextInjection {
  /** Relevant memory segments */
  memories: MemorySegment[];
  /** Personality snapshot */
  personality: PersonalityConfig;
  /** Security mask applied */
  securityMask: SecurityMask;
}

/** Security mask controlling data visibility */
export interface SecurityMask {
  /** Fields to redact from context */
  redactedFields: string[];
  /** Maximum clearance tier (1 = public, 5 = owner-only) */
  clearanceTier: number;
}

/** Top-level scaffold definition */
export interface Scaffold {
  /** Scaffold id */
  id: string;
  /** Semantic version */
  version: string;
  /** Owner user id */
  ownerId: string;
  /** Identity block */
  identity: {
    personality: PersonalityConfig;
    voice: string;
  };
  /** Long-term memory */
  memory: {
    segments: MemorySegment[];
  };
  /** Declared capabilities */
  capabilities: Capability[];
  /** Reusable task templates */
  taskTemplates: TaskTemplate[];
  /** Routing configuration */
  routing: {
    /** Budget tiers: tier label → max tokens */
    budgets: Record<string, number>;
    /** Priority tiers: tier label → priority */
    tiers: Record<string, MessagePriority>;
  };
  /** Security configuration */
  security: SecurityMask;
}

// ─── Controller State ───

/** Tracks budget consumption during a task */
export interface BudgetTracker {
  /** Total token budget */
  allocated: number;
  /** Tokens consumed so far */
  consumed: number;
  /** Per-step breakdown */
  perStep: Record<string, number>;
}

/** A step currently executing in a pipeline */
export interface ActiveStep {
  /** Step definition */
  step: NeuronStep;
  /** Status */
  status: 'pending' | 'running' | 'complete' | 'failed';
  /** Result payload, if complete */
  result?: Record<string, unknown>;
  /** ISO-8601 start time */
  startedAt?: string;
  /** ISO-8601 completion time */
  completedAt?: string;
}

/** An active pipeline managed by the controller */
export interface ActivePipeline {
  /** Task id */
  taskId: string;
  /** Scaffold id this pipeline belongs to */
  scaffoldId: string;
  /** Ordered active steps */
  steps: ActiveStep[];
  /** Current step index */
  currentStepIndex: number;
  /** Budget tracker */
  budget: BudgetTracker;
  /** Pipeline status */
  status: 'running' | 'complete' | 'failed';
}

/** Full controller state snapshot */
export interface ControllerState {
  /** Active pipelines keyed by taskId */
  pipelines: Map<string, ActivePipeline>;
  /** Global budget tracker */
  globalBudget: BudgetTracker;
}
