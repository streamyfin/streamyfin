import { render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
import { TV_PANEL_BACKING } from "@/constants/Colors";
import { TVSaveAccountModal } from "./TVSaveAccountModal";

// The blur is drawn natively; here it only holds its content.
jest.mock("expo-blur", () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/tv", () => ({
  TVOptionCard: () => null,
  useTVFocusAnimation: () => ({
    focused: false,
    handleFocus: () => {},
    handleBlur: () => {},
    animatedStyle: {},
  }),
}));
jest.mock("@/components/inputs/TVPinInput", () => ({ TVPinInput: () => null }));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 30, body: 20, callout: 20 }),
}));

const renderSheet = () =>
  render(
    <TVSaveAccountModal
      visible
      onClose={() => {}}
      onSave={() => {}}
      username='someone'
    />,
  );

const panelBackground = () =>
  StyleSheet.flatten(screen.getByTestId("tv-save-account-panel").props.style)
    .backgroundColor;

// Android TV does not blur what is behind a BlurView, it only tints it: the
// sign-in form's buttons showed through the sheet (seen on a Google TV
// Streamer, 2026-11-03).
test("on Android TV the sheet draws a backing of its own over the form behind it", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await renderSheet();

  expect(panelBackground()).toBe(TV_PANEL_BACKING);
});

// Apple TV really blurs behind the sheet, as behind its other sign-in sheets:
// a backing there would turn the frosted glass into a flat panel.
test("on Apple TV the sheet keeps its frosted glass", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  await renderSheet();

  expect(panelBackground()).toBeUndefined();
});
