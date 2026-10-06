/** MPV briefly reports loading for seeks, including a scheduled Unpause's
 * catch-up seek. Reporting those as stalls repeatedly pauses the whole group.
 * A decoder that is not loaded still enters the readiness barrier immediately.
 */
export class NativeSyncPlayBufferingReporter {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly report: (buffering: boolean) => void,
    private readonly delayMs = 250,
  ) {}

  update(buffering: boolean, ready: boolean) {
    this.reset();
    if (!buffering || !ready) {
      this.report(buffering);
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.report(true);
    }, this.delayMs);
  }

  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
