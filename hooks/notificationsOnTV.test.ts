import { stubReactNative } from "@/test-utils/reactNative";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);

// TV builds leave this native module out (react-native.config.js), and loading it there
// fails as the app starts. What the root layout and the settings pull in loads it only
// off TV, like app/_layout.tsx does.
jest.mock("expo-notifications", () => {
  throw new Error("expo-notifications is left out of TV builds");
});
jest.mock("sonner-native", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

describe("on TV", () => {
  beforeEach(() => stubReactNative({ isTV: true }));

  test.each([
    ["the notification buttons", "@/hooks/useNotificationActions"],
    [
      "the banner of the Notifications screen",
      "@/components/settings/notifications/NotificationPermissionBanner",
    ],
  ])("%s load without the notifications module", (_what, path) => {
    expect(() => require(path)).not.toThrow();
  });
});
