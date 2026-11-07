import { renderHook } from "@testing-library/react-native";
import { stubReactNative } from "@/test-utils/reactNative";
import type { HapticFeedbackType } from "./useHaptic";

const mockImpact = jest.fn();
const mockNotification = jest.fn();
const mockSelection = jest.fn();
let mockSettings: { disableHapticFeedback?: boolean } = {};

// The real hook is under test, not the double `test-utils/unitSetup.ts` installs.
jest.unmock("@/hooks/useHaptic");
jest.mock("expo-haptics", () => ({
  impactAsync: mockImpact,
  notificationAsync: mockNotification,
  selectionAsync: mockSelection,
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));

// `useHaptic` reads `Platform.isTV` when it loads, so it is required per case.
// The isolated registry keeps the renderer's copy of React.
const loadHook = (isTV = false) => {
  const react = jest.requireActual("react");
  let useHaptic: typeof import("./useHaptic").useHaptic | undefined;
  jest.isolateModules(() => {
    jest.doMock("react", () => react);
    stubReactNative({ isTV });
    useHaptic = require("./useHaptic").useHaptic;
  });
  return async (type?: HapticFeedbackType) => {
    const { result } = await renderHook(() =>
      (useHaptic as NonNullable<typeof useHaptic>)(type),
    );
    return result.current;
  };
};

describe("useHaptic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettings = {};
  });

  it("fires the impact style the feedback type names", async () => {
    const render = loadHook();
    (await render("heavy"))();
    expect(mockImpact).toHaveBeenCalledWith("heavy");
  });

  it.each(["success", "warning", "error"] as const)(
    "fires a %s notification",
    async (type) => {
      const render = loadHook();
      (await render(type))();
      expect(mockNotification).toHaveBeenCalledTimes(1);
      expect(mockNotification).toHaveBeenCalledWith(type);
    },
  );

  it("falls back to the selection tick by default", async () => {
    const render = loadHook();
    (await render())();
    expect(mockSelection).toHaveBeenCalled();
  });

  it("does nothing when the user disabled haptic feedback", async () => {
    mockSettings = { disableHapticFeedback: true };
    const render = loadHook();
    (await render("light"))();
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("does nothing on TV, where expo-haptics is never loaded", async () => {
    const render = loadHook(true);
    (await render("light"))();
    expect(mockImpact).not.toHaveBeenCalled();
  });
});
