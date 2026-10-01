/**
 * A sheet's one action at a time, and no answer once the sheet is gone.
 * Android TV can deliver one press twice in the same batch, before a
 * disabled state reaches the button, and an answer that came after the user
 * closed the sheet closed the screen under it instead.
 */
export const createSubmission = () => {
  let running = false;
  let dismissed = false;
  return {
    /**
     * Marks the sheet shown, from its mount effect: React runs that effect's
     * cleanup and setup again without unmounting, under Fast Refresh and
     * StrictMode.
     */
    show: (): void => {
      dismissed = false;
    },
    /** Starts the action, unless one is running or the sheet is gone. */
    start: (): boolean => {
      if (running || dismissed) return false;
      running = true;
      return true;
    },
    /** Ends it; whether the sheet is still there to show the outcome. */
    finish: (): boolean => {
      running = false;
      return !dismissed;
    },
    /** Marks the sheet gone; true the first time only. */
    dismiss: (): boolean => {
      if (dismissed) return false;
      dismissed = true;
      return true;
    },
  };
};
