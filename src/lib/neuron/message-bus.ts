import { v4 as uuid } from 'uuid';
import type { NeuronMessage, MessagePriority } from './types';

type MessageHandler = (message: NeuronMessage) => void;

/**
 * In-process message bus for neuron-to-neuron communication.
 * Uses a lightweight pub/sub model with per-task audit logs.
 */
export class NeuronMessageBus {
  /** topic → set of handlers */
  private subscribers = new Map<string, Set<MessageHandler>>();
  /** taskId → ordered message log */
  private taskMessages = new Map<string, NeuronMessage[]>();

  /** Publish a message to a specific topic (message.type is the topic key). */
  publish(message: NeuronMessage): void {
    this.audit(message);
    const handlers = this.subscribers.get(message.type);
    if (handlers) {
      Array.from(handlers).forEach((handler) => handler(message));
    }
  }

  /** Subscribe to messages of a given type. Returns an unsubscribe function. */
  subscribe(type: string, handler: MessageHandler): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type)!.add(handler);
    return () => {
      this.subscribers.get(type)?.delete(handler);
    };
  }

  /** Broadcast a message to all subscribers across every topic. */
  broadcast(message: NeuronMessage): void {
    this.audit(message);
    Array.from(this.subscribers.values()).forEach((handlers) => {
      Array.from(handlers).forEach((handler) => handler(message));
    });
  }

  /** Retrieve the full audit trail for a task. */
  getTaskMessages(taskId: string): NeuronMessage[] {
    return this.taskMessages.get(taskId) ?? [];
  }

  /** Create a pre-filled message builder. */
  static createMessage(
    overrides: Partial<NeuronMessage> & Pick<NeuronMessage, 'from' | 'to' | 'type' | 'taskId'>
  ): NeuronMessage {
    return {
      id: uuid(),
      payload: {},
      timestamp: new Date().toISOString(),
      priority: 'normal' as MessagePriority,
      ttl: 30_000,
      cost: 0,
      ...overrides,
    };
  }

  // ── internals ──

  private audit(message: NeuronMessage): void {
    if (!this.taskMessages.has(message.taskId)) {
      this.taskMessages.set(message.taskId, []);
    }
    this.taskMessages.get(message.taskId)!.push(message);
  }
}
