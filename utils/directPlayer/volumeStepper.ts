import { REMOTE_VOLUME_STEP_SETTLE_MS } from "@/constants/Playback";

const clamp = (volume: number) => Math.min(Math.max(volume, 0), 1);

/**
 * Sets the system volume for the commands a server sends. A step that comes in
 * before the previous command has landed starts from that command's target
 * rather than from a reading the write has not changed yet, and an absolute
 * volume set in between is where the next step starts. A step still waiting
 * for its read when an absolute volume is set gives way to it.
 * Spec: utils/directPlayer/volumeStepper.test.ts.
 */
export const createVolumeStepper = (
  read: () => Promise<number>,
  write: (volume: number) => void,
) => {
  let pending: Promise<number> | null = null;
  // Bumped by an absolute set, so a step started before it does not write.
  let generation = 0;
  const settle = (target: Promise<number>) =>
    setTimeout(() => {
      if (pending === target) pending = null;
    }, REMOTE_VOLUME_STEP_SETTLE_MS);

  return {
    step: async (step: number): Promise<void> => {
      const started = generation;
      const target = (pending ?? read()).then((volume) => clamp(volume + step));
      pending = target;
      const volume = await target;
      if (started !== generation) return;
      write(volume);
      settle(target);
    },
    set: (volume: number) => {
      generation += 1;
      const target = Promise.resolve(clamp(volume));
      pending = target;
      write(clamp(volume));
      settle(target);
    },
  };
};
