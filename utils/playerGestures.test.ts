import { resolvePlayerGestures } from "./playerGestures";

const allOn = {
  enableHorizontalSwipeSkip: true,
  enableLeftSideBrightnessSwipe: true,
  enableRightSideVolumeSwipe: true,
  enableHoldToSpeed: true,
  enablePinchToZoom: true,
  enableDoubleTapToSeek: true,
};

describe("resolvePlayerGestures", () => {
  test("follows each gesture's own switch while the master switch is on", () => {
    expect(
      resolvePlayerGestures({
        ...allOn,
        enablePlayerGestures: true,
        enableRightSideVolumeSwipe: false,
        enableDoubleTapToSeek: false,
      }),
    ).toEqual({
      horizontalSwipeSkip: true,
      brightnessSwipe: true,
      volumeSwipe: false,
      holdToSpeed: true,
      pinchToZoom: true,
      doubleTapToSeek: false,
    });
  });

  // The reported problem: accidental brightness, volume and seek changes.
  // One switch must turn every gesture off, whatever the others say.
  test("turns every gesture off with the master switch", () => {
    const gestures = resolvePlayerGestures({
      ...allOn,
      enablePlayerGestures: false,
    });
    expect(Object.values(gestures).every((on) => on === false)).toBe(true);
  });

  // Settings saved before the master switch existed have no value for it.
  test("keeps gestures on when the master switch was never set", () => {
    expect(resolvePlayerGestures(allOn).volumeSwipe).toBe(true);
  });

  test("gives a gesture with no saved value its default", () => {
    expect(resolvePlayerGestures({})).toEqual({
      horizontalSwipeSkip: true,
      brightnessSwipe: true,
      volumeSwipe: true,
      holdToSpeed: true,
      pinchToZoom: true,
      doubleTapToSeek: false,
    });
  });
});
