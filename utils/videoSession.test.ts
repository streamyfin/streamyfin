import { enterVideoSession, isVideoSessionOpen } from "./videoSession";

describe("the video session", () => {
  test("is open from the moment a player enters until it leaves", () => {
    expect(isVideoSessionOpen()).toBe(false);
    const leave = enterVideoSession();
    expect(isVideoSessionOpen()).toBe(true);
    leave();
    expect(isVideoSessionOpen()).toBe(false);
  });

  // The page player and the native one overlap while one hands over to the
  // other: the first to leave must not close it under the second.
  test("stays open until the last player has left", () => {
    const leavePage = enterVideoSession();
    const leaveNative = enterVideoSession();

    leavePage();
    expect(isVideoSessionOpen()).toBe(true);
    // An effect cleanup that runs twice counts once.
    leavePage();
    expect(isVideoSessionOpen()).toBe(true);

    leaveNative();
    expect(isVideoSessionOpen()).toBe(false);
  });
});
