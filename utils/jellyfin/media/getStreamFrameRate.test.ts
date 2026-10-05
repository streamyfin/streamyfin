import { getStreamFrameRate } from "./getStreamFrameRate";

describe("getStreamFrameRate", () => {
  test("prefers the reference frame rate over the average", () => {
    // The case the switch exists for: a variable frame rate file whose
    // average is off, while the server's reference rate is the real one.
    expect(
      getStreamFrameRate({
        ReferenceFrameRate: 23.976,
        AverageFrameRate: 1000,
      }),
    ).toBe(23.976);
  });

  test("falls back to the average when the server sends no reference rate", () => {
    expect(getStreamFrameRate({ AverageFrameRate: 25 })).toBe(25);
    expect(
      getStreamFrameRate({ ReferenceFrameRate: null, AverageFrameRate: 25 }),
    ).toBe(25);
  });

  test("reports nothing when the stream carries no frame rate", () => {
    expect(getStreamFrameRate({})).toBeUndefined();
    expect(
      getStreamFrameRate({ ReferenceFrameRate: null, AverageFrameRate: null }),
    ).toBeUndefined();
  });

  // A zero reference rate is not handed over to the average: the server
  // already chose between the two, and the average it turned down is the
  // unrealistic one.
  test("reports nothing for a frame rate of zero", () => {
    expect(getStreamFrameRate({ AverageFrameRate: 0 })).toBeUndefined();
    expect(
      getStreamFrameRate({ ReferenceFrameRate: 0, AverageFrameRate: 1000 }),
    ).toBeUndefined();
  });

  test("reports nothing without a stream", () => {
    expect(getStreamFrameRate(undefined)).toBeUndefined();
    expect(getStreamFrameRate(null)).toBeUndefined();
  });
});
