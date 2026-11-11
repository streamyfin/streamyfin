const mockNative = {
  getVolume: jest.fn(() => 0.4),
  getVolumeAsync: jest.fn(async () => 0.4),
  isVolumeFixed: jest.fn(() => false),
  setVolume: jest.fn(async (_volume: number) => {}),
  setVolumeIndicatorHidden: jest.fn(async (_hidden: boolean) => {}),
  addListener: jest.fn(),
};
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireNativeModule: () => mockNative,
}));

// Required here rather than imported: an import runs before `mockNative`
// exists, and the module swallows the failure and loads as unavailable.
const { getSystemVolumeAsync, hideSystemVolumeIndicator, setSystemVolume } =
  require("./index") as typeof import("./index");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getSystemVolumeAsync", () => {
  test("reads the volume without the synchronous call", async () => {
    await expect(getSystemVolumeAsync()).resolves.toBe(0.4);
    expect(mockNative.getVolume).not.toHaveBeenCalled();
  });

  // A failed read must not read as "muted".
  test("answers 1 when the read fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockNative.getVolumeAsync.mockRejectedValueOnce(new Error("no session"));

    await expect(getSystemVolumeAsync()).resolves.toBe(1);
  });
});

describe("setSystemVolume", () => {
  // A gesture or a remote command can ask for more than the range holds.
  test("keeps the volume between 0 and 1", () => {
    setSystemVolume(1.4);
    setSystemVolume(-0.2);
    setSystemVolume(0.5);

    expect(mockNative.setVolume.mock.calls).toEqual([[1], [0], [0.5]]);
  });
});

describe("hideSystemVolumeIndicator", () => {
  // The player's slider and a volume gesture both hold the indicator back:
  // the gesture ending must not bring it back over a slider still on screen.
  test("brings the indicator back once the last hold is released", () => {
    const slider = hideSystemVolumeIndicator();
    const gesture = hideSystemVolumeIndicator();

    gesture();
    expect(mockNative.setVolumeIndicatorHidden.mock.calls).toEqual([[true]]);

    slider();
    expect(mockNative.setVolumeIndicatorHidden.mock.calls).toEqual([
      [true],
      [false],
    ]);
  });

  test("counts a hold released twice once", () => {
    const first = hideSystemVolumeIndicator();
    const second = hideSystemVolumeIndicator();

    first();
    first();
    expect(mockNative.setVolumeIndicatorHidden.mock.calls).toEqual([[true]]);

    second();
    expect(mockNative.setVolumeIndicatorHidden.mock.calls).toEqual([
      [true],
      [false],
    ]);
  });
});
