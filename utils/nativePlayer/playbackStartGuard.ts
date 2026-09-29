/** Drop repeated Play taps until negotiation and player selection finish. */
export function createPlaybackStartGuard() {
  let starting = false;
  return async (start: () => Promise<void>): Promise<void> => {
    if (starting) return;
    // Set synchronously, before any network work or React render.
    starting = true;
    try {
      await start();
    } finally {
      starting = false;
    }
  };
}
