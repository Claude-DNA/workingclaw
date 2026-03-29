import type { NeuronInstance, NeuronType, NeuronStatus, Capability } from './types';

/**
 * In-memory registry of neuron instances.
 * Tracks status, capabilities, and task claims.
 */
export class NeuronRegistry {
  private neurons = new Map<string, NeuronInstance>();

  /** Register a new neuron instance. */
  register(instance: NeuronInstance): void {
    this.neurons.set(instance.id, { ...instance, registeredAt: new Date().toISOString() });
  }

  /** Remove a neuron from the registry. */
  deregister(id: string): boolean {
    return this.neurons.delete(id);
  }

  /**
   * Find available neurons that satisfy the given capability requirements.
   * Only returns neurons with status 'idle'.
   */
  findAvailable(
    type: NeuronType,
    requiredCapabilities: string[] = []
  ): NeuronInstance[] {
    const results: NeuronInstance[] = [];
    for (const neuron of Array.from(this.neurons.values())) {
      if (neuron.type !== type) continue;
      if (neuron.status !== 'idle') continue;
      if (requiredCapabilities.length > 0) {
        const capNames = new Set(neuron.capabilities.map((c) => c.name));
        if (!requiredCapabilities.every((r) => capNames.has(r))) continue;
      }
      results.push(neuron);
    }
    return results;
  }

  /** Claim a neuron for a task. Sets status to 'claimed'. */
  claim(neuronId: string, taskId: string): boolean {
    const neuron = this.neurons.get(neuronId);
    if (!neuron || neuron.status !== 'idle') return false;
    neuron.status = 'claimed';
    neuron.currentTaskId = taskId;
    return true;
  }

  /** Release a neuron back to idle. */
  release(neuronId: string): boolean {
    const neuron = this.neurons.get(neuronId);
    if (!neuron) return false;
    neuron.status = 'idle';
    neuron.currentTaskId = null;
    return true;
  }

  /** Get the current status of a neuron. */
  getStatus(neuronId: string): NeuronStatus | null {
    return this.neurons.get(neuronId)?.status ?? null;
  }

  /** Get a neuron instance by id. */
  get(neuronId: string): NeuronInstance | undefined {
    return this.neurons.get(neuronId);
  }

  /** List all registered neurons. */
  listAll(): NeuronInstance[] {
    return Array.from(this.neurons.values());
  }
}
