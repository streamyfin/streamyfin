/**
 * Always-mounted host for the Chromecast autoplay watcher. Renders nothing —
 * it exists only to run `useCastAutoplay` for the app's lifetime, so autoplay
 * fires regardless of which screen is open.
 */

import { useCastAutoplay } from "@/hooks/useCastAutoplay";

export function CastAutoplayWatcher() {
  useCastAutoplay();
  return null;
}
