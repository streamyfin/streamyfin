/**
 * reconcileToGroupOnAttach — estimate the group's current position from
 * the last play/pause broadcast and seek the freshly-attached player
 * there if drift exceeds the threshold.
 *
 * Web's player binds at group-join, so this race doesn't exist there.
 * On RN the player mounts in a separate route after the join, so
 * commands arrive before controls attach. Without this, the player
 * resumes from its local position and is silently behind the group.
 */

import { TicksPerMillisecond } from "../constants";
import {
  type PlayerControls,
  type SendCommand,
  SYNC_PLAY_TUNING,
} from "../types";

export function reconcileToGroupOnAttach(
  controls: PlayerControls,
  lastCommand: SendCommand | null,
  localToRemote: (local: Date) => Date,
): void {
  if (
    !lastCommand ||
    (lastCommand.Command !== "Unpause" && lastCommand.Command !== "Pause") ||
    !lastCommand.When ||
    lastCommand.PositionTicks == null
  ) {
    return;
  }

  try {
    const commandWhen = new Date(lastCommand.When);
    let targetTicks = lastCommand.PositionTicks;
    if (lastCommand.Command === "Unpause") {
      const remoteNow = localToRemote(new Date());
      targetTicks +=
        (remoteNow.getTime() - commandWhen.getTime()) * TicksPerMillisecond;
    }
    const targetMs = Math.max(0, targetTicks / TicksPerMillisecond);
    const currentMs = controls.getCurrentPosition();
    if (
      Math.abs(currentMs - targetMs) >
      SYNC_PLAY_TUNING.positionReconcileThresholdMs
    ) {
      console.log(
        `SyncPlay: player attached — seeking to estimated group position ${targetMs}ms (was ${currentMs}ms)`,
      );
      controls.seekTo(targetMs);
    }
  } catch (error) {
    console.warn(
      "SyncPlay: failed to estimate group position on attach",
      error,
    );
  }
}
