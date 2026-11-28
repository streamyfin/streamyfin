import {
  addSpeedDataPoint,
  calculateETA,
  calculateSpeed,
  resetAllSpeedData,
} from "./useDownloadSpeedCalculator";

const MB = 1024 * 1024;
const ID = "item";

describe("download speed", () => {
  let now: number;

  /** Feeds one progress event, the way native delivers them. */
  const report = (afterMs: number, bytes: number) => {
    now += afterMs;
    addSpeedDataPoint(ID, bytes);
  };

  beforeEach(() => {
    now = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    resetAllSpeedData();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads a steady transfer at its real rate", () => {
    let bytes = 0;
    for (let i = 0; i < 40; i++) {
      bytes += 2.5 * MB;
      report(500, bytes);
    }

    expect(calculateSpeed(ID)! / MB).toBeCloseTo(5, 1);
  });

  it("holds a bursty transfer near its average through the lull", () => {
    // A 49 MB burst and then 4.5 s of trickle, 10 MB/s overall. The card read 2.52 MB/s here
    // when the newest few events outweighed the burst before them.
    let bytes = 0;
    for (let cycle = 0; cycle < 8; cycle++) {
      bytes += 49 * MB;
      report(500, bytes);
      for (let i = 0; i < 9; i++) {
        bytes += MB / 9;
        report(500, bytes);
      }
    }

    expect(calculateSpeed(ID)! / MB).toBeGreaterThan(8);
  });

  it("follows a real slowdown once it has lasted the window", () => {
    let bytes = 0;
    for (let i = 0; i < 100; i++) {
      bytes += 2.5 * MB;
      report(500, bytes);
    }
    for (let i = 0; i < 40; i++) {
      bytes += 0.05 * MB;
      report(500, bytes);
    }

    expect(calculateSpeed(ID)! / MB).toBeCloseTo(0.1, 1);
  });

  it("projects the ETA from the same speed the card shows", () => {
    // 56 MB left at 2.5 MB/s, with a lull at the end that must not turn it into half an hour.
    let bytes = 300 * MB;
    for (let cycle = 0; cycle < 8; cycle++) {
      bytes += 24 * MB;
      report(500, bytes);
      for (let i = 0; i < 9; i++) {
        bytes += MB / 9;
        report(500, bytes);
      }
    }

    const speed = calculateSpeed(ID)!;
    const eta = calculateETA(ID, bytes, bytes + 56 * MB)!;

    expect(eta).toBeCloseTo((56 * MB) / speed, 3);
    expect(eta).toBeLessThan(60);
  });

  it("reads a slow transcode whose events arrive seconds apart", () => {
    // Native reports only when bytes arrive, so a slow transcode put fewer than five events in
    // the window and the card showed no speed at all while it downloaded (The Hobbit at ~0.3 MB/s).
    let bytes = 0;
    for (let i = 0; i < 10; i++) {
      bytes += MB;
      report(4000, bytes);
    }

    expect(calculateSpeed(ID)! / MB).toBeCloseTo(0.25, 2);
  });

  it("has no speed until there are enough samples to trust", () => {
    report(500, MB);
    report(500, 2 * MB);

    expect(calculateSpeed(ID)).toBeUndefined();
  });
});
