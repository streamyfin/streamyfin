type Listener<T = void> = (data?: T) => void;

class EventBus {
  private listeners: Record<string, Listener<any>[]> = {};

  on<T = void>(event: string, callback: Listener<T>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off<T = void>(event: string, callback: Listener<T>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(
      (fn) => fn !== callback
    );
  }

  emit<T = void>(event: string, data?: T): void {
    this.listeners[event]?.forEach((callback) => callback(data));
  }
}

export const eventBus = new EventBus();
