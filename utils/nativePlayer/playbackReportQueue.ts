type ReportKind = "start" | "progress" | "final-progress" | "stop";

/**
 * Jellyfin maintains one playback state per device, including across media
 * sessions. Preserve native event order across every Start/Progress/Stop write.
 */
export class NativePlaybackReportQueue {
  private tail: Promise<void> = Promise.resolve();
  private closedSessions = new WeakSet<object>();

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
    const request = this.tail.then(async () => {
      if (kind === "progress" && this.closedSessions.has(session)) return;
      await report(payload);
    });
    // A failed HTTP write must not suppress a later pause, Stop or new Start.
    this.tail = request.catch(() => {});
    return request;
  }
}
