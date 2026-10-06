import { seerrStatusBadge } from "./statusBadge";
import { MediaStatus } from "./types";

// The badge over a title, as Seerr draws it (StatusBadgeMini), on the phone
// and on the TV alike.
describe("seerrStatusBadge", () => {
  test("draws Seerr's icon for each status it marks", () => {
    expect(seerrStatusBadge(MediaStatus.PENDING, false)).toEqual({
      icon: "bell",
      tone: "pending",
    });
    expect(seerrStatusBadge(MediaStatus.PROCESSING, false)).toEqual({
      icon: "clock",
      tone: "processing",
    });
    expect(seerrStatusBadge(MediaStatus.PARTIALLY_AVAILABLE, false)).toEqual({
      icon: "minus",
      tone: "partial",
    });
    expect(seerrStatusBadge(MediaStatus.AVAILABLE, false)).toEqual({
      icon: "check",
      tone: "available",
    });
    expect(seerrStatusBadge(MediaStatus.BLOCKLISTED, false)).toEqual({
      icon: "eye-off",
      tone: "blocklisted",
    });
  });

  test("offers a request on a title Seerr does not hold, when allowed", () => {
    expect(seerrStatusBadge(undefined, true)).toEqual({
      icon: "plus",
      tone: "request",
    });
    expect(seerrStatusBadge(MediaStatus.UNKNOWN, true)).toEqual({
      icon: "plus",
      tone: "request",
    });
  });

  test("draws nothing on a title nobody may request", () => {
    expect(seerrStatusBadge(undefined, false)).toBeUndefined();
    expect(seerrStatusBadge(MediaStatus.UNKNOWN, false)).toBeUndefined();
  });

  // The phone kept the last icon when a title went back to unknown, the
  // badge only ever being set, never cleared.
  test("keeps a status's own icon whatever the request right", () => {
    expect(seerrStatusBadge(MediaStatus.AVAILABLE, true)?.icon).toBe("check");
  });
});
