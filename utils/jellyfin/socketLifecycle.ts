export interface LifecycleSocket {
  readonly readyState: number;
  close(): void;
  send(data: string): void;
}

/** Transient inactivity and presented playback must not replace a healthy
 * socket. Background leases let native playback own its leave/PiP decision.
 */
export class SocketLifecycle {
  private socket: LifecycleSocket | null = null;
  private readonly backgroundLeases = new Set<object>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly appState: () => string | null,
    private readonly onDisconnect: () => void = () => {},
  ) {}

  setSocket(socket: LifecycleSocket) {
    this.cancelReconnect();
    this.socket = socket;
  }

  isCurrent(socket: LifecycleSocket) {
    return this.socket === socket;
  }

  private hasLiveSocket() {
    // WebSocket CONNECTING=0, OPEN=1; constants remain available in unit tests.
    return this.socket?.readyState === 0 || this.socket?.readyState === 1;
  }

  canConnect() {
    return (
      !this.hasLiveSocket() &&
      (this.appState() !== "background" || this.backgroundLeases.size > 0)
    );
  }

  sendKeepAlive(socket: LifecycleSocket) {
    if (!this.isCurrent(socket) || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify({ MessageType: "KeepAlive" }));
      return true;
    } catch {
      return false;
    }
  }

  respondToKeepAlive(socket: LifecycleSocket, messageType: unknown) {
    return messageType === "ForceKeepAlive" && this.sendKeepAlive(socket);
  }

  hasPendingReconnect() {
    return this.reconnectTimer !== null;
  }

  /** Error and close often arrive together; retain one retry and deadline. */
  scheduleReconnect(
    socket: LifecycleSocket,
    delayMs: number,
    reconnect: () => void,
  ) {
    if (!this.isCurrent(socket) || this.hasPendingReconnect()) return false;
    if (this.appState() === "background" && this.backgroundLeases.size === 0)
      return false;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isCurrent(socket) && this.canConnect()) reconnect();
    }, delayMs);
    return true;
  }

  cancelReconnect() {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** Returns true only when foregrounding needs a fresh connection. */
  onAppState(state: string) {
    if (state === "background" && this.backgroundLeases.size === 0)
      this.close();
    return state === "active" && !this.hasLiveSocket();
  }

  retainInBackground = () => {
    const lease = {};
    this.backgroundLeases.add(lease);
    return () => {
      if (!this.backgroundLeases.delete(lease)) return;
      if (this.backgroundLeases.size === 0 && this.appState() === "background")
        this.close();
    };
  };

  /** API, network and provider teardown bypass playback's background lease. */
  close() {
    const socket = this.socket;
    if (socket) this.closeSocket(socket);
    else this.cancelReconnect();
  }

  closeSocket(socket: LifecycleSocket) {
    if (this.isCurrent(socket)) {
      this.cancelReconnect();
      // close() can synchronously deliver callbacks. Invalidate first so
      // intentional teardown never retries an old account or server.
      this.socket = null;
      this.onDisconnect();
    }
    if (socket.readyState === 0 || socket.readyState === 1) socket.close();
  }
}
