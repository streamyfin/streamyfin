import { PLAYBACK_REPORT_TIMEOUT_MS } from "@/constants/Playback";

type ReportKind = "start" | "progress" | "final-progress" | "stop";

/**
 * Jellyfin maintains one playback state per device, including across media
 * sessions. Preserve native event order across every Start/Progress/Stop write.
 */
export class NativePlaybackReportQueue {
  private tail: Promise<void> = Promise.resolve();
  private closedSessions = new WeakSet<object>();
  private waiting = 0;
  private latestProgress = new WeakMap<object, object>();

  constructor(private readonly timeoutMs = PLAYBACK_REPORT_TIMEOUT_MS) {}

  /**
   * Stops waiting, not the request: the queue moves on and the caller sees a
   * failure, whatever the client underneath does with a server that has
   * stopped answering.
   */
  private bounded(report: Promise<unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      report,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Playback report timed out")),
          this.timeoutMs,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }

  closeSession(session: object) {
    this.closedSessions.add(session);
  }

  enqueue<T extends object>(
    session: object,
    kind: ReportKind,
    snapshot: T,
    report: (snapshot: T) => Promise<unknown>,
  ): Promise<void> {
    // Native reporting DTOs contain scalar session fields. Copy before any
    // subsequent decoder tick, drift correction or ref replacement can run.
    const payload = { ...snapshot };
    if (kind === "stop") this.closeSession(session);
    const queuedBehindAnother = this.waiting > 0;
    this.waiting++;
    if (kind === "progress") this.latestProgress.set(session, payload);
    const request = this.tail.then(async () => {
      try {
        if (kind === "progress") {
          if (this.closedSessions.has(session)) return;
          // The SDK client has no timeout. Behind a server that stopped
          // answering, ticks would otherwise pile up and drain one per
          // timeout: only the newest position is still worth sending.
          if (
            queuedBehindAnother &&
            this.latestProgress.get(session) !== payload
          )
            return;
        }
        await this.bounded(report(payload));
      } finally {
        this.waiting--;
      }
    });
    // A failed HTTP write must not suppress a later pause, Stop or new Start.
    this.tail = request.catch(() => {});
    return request;
  }
}
