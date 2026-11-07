import { render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
import { TV_PANEL_BACKING } from "@/constants/Colors";
import { TVPasswordEntryModal } from "./TVPasswordEntryModal";
import { TVPINEntryModal } from "./TVPINEntryModal";

// The blur is drawn natively; here it only holds its content.
jest.mock("expo-blur", () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/tv", () => ({
  useTVFocusAnimation: () => ({
    focused: false,
    handleFocus: () => {},
    handleBlur: () => {},
    animatedStyle: {},
  }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 30, body: 20, callout: 20 }),
}));
jest.mock("@/hooks/useTVBackPress", () => ({ useTVBackPress: () => {} }));
jest.mock("@/utils/secureCredentials", () => ({
  verifyAccountPIN: async () => false,
}));

// The save-account sheet's sign-in siblings, opened from the same TV sign-in
// screen: Android TV only tints behind a BlurView, so the account list read
// through them.
const SHEETS = [
  [
    "password",
    "tv-password-panel",
    () => (
      <TVPasswordEntryModal
        visible
        onClose={() => {}}
        onSubmit={async () => {}}
        username='someone'
      />
    ),
  ],
  [
    "PIN",
    "tv-pin-panel",
    () => (
      <TVPINEntryModal
        visible
        onClose={() => {}}
        onSuccess={() => {}}
        serverUrl='https://server'
        userId='user'
        username='someone'
      />
    ),
  ],
] as const;

const panelBackground = (panelId: string) =>
  StyleSheet.flatten(screen.getByTestId(panelId).props.style).backgroundColor;

describe.each(SHEETS)("the %s sheet", (_name, panelId, sheet) => {
  test("on Android TV draws a backing of its own over the page behind it", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await render(sheet());

    expect(panelBackground(panelId)).toBe(TV_PANEL_BACKING);
  });

  test("on Apple TV keeps its frosted glass", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await render(sheet());

    expect(panelBackground(panelId)).toBeUndefined();
  });
});
