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
  /** Trait name → intensity (0–1), e.g. {"warmth": 0.8, "formality": 0.3} */
  traits: Record<string, number>;
  /** Hard constraints the personality must obey, e.g. ["never swear", "always greet by name"] */
  constraints: string[];
  /** Current emotional state */
  emotionalState: {
    current: string;
    updatedAt: number;
    updatedBy: string;
  };
}

/** Voice configuration — how the scaffold sounds */
export interface VoiceConfig {
  /** Tone description, e.g. "warm and direct" */
  tone: string;
  /** Vocabulary level: "technical" | "casual" | "mixed" */
  vocabulary: string;
  /** Distinctive speech patterns, e.g. ["uses nautical metaphors", "starts with a question"] */
  quirks: string[];
}

/** A discrete segment of long-term memory */
export interface MemorySegment {
  /** Unique segment id */
  id: string;
  /** Raw text content */
  content: string;
  /** Vector embedding for semantic search */
  embedding?: number[];
  /** Searchable tags, e.g. ["kitchen", "decision", "budget"] */
  tags: string[];
  /** Relevance score (0–1), decays over time unless reinforced */
  relevanceScore: number;
  /** Token count of content */
  tokenCount: number;
  /** ISO-8601 creation time */
  createdAt: string;
  /** How often neurons have accessed this segment */
  accessCount: number;
  /** Origin: "user-conversation" | "task-result" | "imported" */
  source: string;
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

/** Capability requirements for neuron matching */
export interface CapabilityRequirement {
  /** Required capability type */
  type: 'text' | 'vision' | 'code' | 'audio' | 'tool-use';
  /** Minimum context window in tokens */
  minContextWindow: number;
  /** Speed tier requirement */
  speed: 'fast' | 'medium' | 'deep';
  /** Optional model allowlist */
  models?: string[];
  /** Max cost per 1k tokens */
  maxCostPer1k?: number;
}

/** A single step within a pipeline or task template */
export interface NeuronStep {
  /** Step id */
  id: string;
  /** Step ordinal */
  order: number;
  /** Which neuron type handles this step */
  neuronType: NeuronType;
  /** Number of neuron instances: fixed count or "auto" for dynamic scaling */
  count: number | 'auto';
  /** Whether instances can run in parallel */
  parallel: boolean;
  /** Capability requirements for neurons in this step */
  capabilityRequirements: CapabilityRequirement;
  /** Step IDs this step depends on (must complete first) */
  dependsOn: string[];
  /** How to resolve multiple neuron outputs */
  negotiation: 'first-wins' | 'consensus' | 'best-score';
  /** Max retries on failure */
  maxRetries: number;
  /** Timeout in seconds for this step */
  timeoutSeconds: number;
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

/** Security mask controlling data visibility per task */
export interface SecurityMask {
  /** Fields to redact from context */
  redactedFields: string[];
  /** Maximum clearance tier (1 = public, 5 = owner-only) */
  clearanceTier: number;
}

/**
 * Top-level scaffold definition — the persistent identity layer.
 * Survives across tasks, neurons, and sessions. Everything a neuron
 * needs to "be" someone comes from here.
 *
 * Design principle: Swarm Intelligence. The scaffold defines the
 * environment that neurons react to (stigmergy), not commands
 * that neurons follow.
 */
export interface Scaffold {
  /** Scaffold id (uuid) */
  id: string;
  /** Increments on every update */
  version: number;
  /** Owner user id */
  ownerId: string;
  /** ISO-8601 creation time */
  createdAt: string;

  /** Identity — who this scaffold "is" */
  identity: {
    /** Display name, e.g. "Maya", "DevBot-7" */
    name: string;
    /** Primary function, e.g. "executive assistant" */
    role: string;
    /** Personality traits and constraints */
    personality: PersonalityConfig;
    /** Voice configuration */
    voice: VoiceConfig;
  };

  /** Long-term memory */
  memory: {
    segments: MemorySegment[];
    /** Maximum segments before eviction */
    maxSegments: number;
    /** How to evict when full */
    evictionPolicy: 'oldest' | 'least-relevant' | 'manual';
  };

  /** Capability requirements for neurons serving this scaffold */
  capabilities: {
    /** Must-have for ANY neuron */
    required: CapabilityRequirement[];
    /** Nice-to-have, used for ranking */
    preferred: CapabilityRequirement[];
    /** Things this scaffold must NEVER do */
    forbidden: string[];
  };

  /** Reusable task templates */
  taskTemplates: TaskTemplate[];

  /** Routing configuration */
  routing: {
    /** Default execution tier */
    defaultTier: 'A' | 'B' | 'C';
    /** Max dollars per single task */
    budgetPerTask: number;
    /** Daily spending cap */
    budgetPerDay: number;
    /** Running total, resets at midnight */
    budgetSpentToday: number;
    /** Ceiling on parallel neurons per task */
    maxNeuronsPerTask: number;
    /** Kill task after this many seconds */
    timeoutSeconds: number;
  };

  /** Security configuration */
  security: {
    /** External APIs this scaffold can call */
    allowedDomains: string[];
    /** Never call these */
    blockedDomains: string[];
    /** Data classification level */
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
    /** How to handle PII in task packets */
    piiPolicy: 'strip' | 'encrypt' | 'deny';
    /** Log all neuron interactions for audit */
    auditLog: boolean;
    /** Per-task security mask */
    mask: SecurityMask;
  };
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
