// ─── Neuron Cloud Protocol — Public API ───

export * from './types';
export { NeuronMessageBus } from './message-bus';
export { NeuronRegistry } from './registry';
export { ScaffoldManager } from './scaffold';
export { ControllerNeuron } from './controller';
export type { TaskResult } from './controller';

import { NeuronMessageBus } from './message-bus';
import { NeuronRegistry } from './registry';
import { ScaffoldManager } from './scaffold';
import { ControllerNeuron } from './controller';
import type { TaskResult } from './controller';

/** Instantiated neuron cloud with all subsystems wired together. */
export interface NeuronCloud {
  bus: NeuronMessageBus;
  registry: NeuronRegistry;
  scaffolds: ScaffoldManager;
  controller: ControllerNeuron;
}

/** Create a fully-wired neuron cloud instance. */
export function createNeuronCloud(): NeuronCloud {
  const bus = new NeuronMessageBus();
  const registry = new NeuronRegistry();
  const scaffolds = new ScaffoldManager();
  const controller = new ControllerNeuron(bus, registry, scaffolds);

  return { bus, registry, scaffolds, controller };
}

/**
 * Convenience function: create a transient cloud, process one message, return the result.
 * Good for stateless API routes.
 */
export async function processUserMessage(
  userMessage: string,
  scaffoldId: string = 'default'
): Promise<TaskResult> {
  const { controller } = createNeuronCloud();
  return controller.processTask(userMessage, scaffoldId);
}
