import { renderHook } from "@testing-library/react-native";
import { stubReactNative } from "@/test-utils/reactNative";
import { useNotificationSettingsLink } from "./useNotificationSettingsLink";

const mockPush = jest.fn();
let mockPending = false;
let mockListener: (() => void) | null = null;

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/modules/notification-settings-link", () => ({
  takePendingSettingsOpen: () => {
    const was = mockPending;
    mockPending = false;
    return was;
  },
  addSettingsOpenListener: (listener: () => void) => {
    mockListener = listener;
    return { remove: jest.fn() };
  },
}));

describe("the link from the iOS Settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubReactNative();
    mockPending = false;
    mockListener = null;
  });

  // Tapped while the app was closed, it still lands on the screen.
  test("opens the Notifications screen when the app was started by it", async () => {
    mockPending = true;

    await renderHook(() => useNotificationSettingsLink());

    expect(mockPush).toHaveBeenCalledWith("/settings/notifications/page");
  });

  test("opens it when tapped while the app runs", async () => {
    await renderHook(() => useNotificationSettingsLink());
    mockListener?.();

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("does nothing otherwise", async () => {
    await renderHook(() => useNotificationSettingsLink());

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("is not listened for on TV, which has no such settings", async () => {
    stubReactNative({ isTV: true });
    mockPending = true;

    await renderHook(() => useNotificationSettingsLink());

    expect(mockPush).not.toHaveBeenCalled();
  });
});
