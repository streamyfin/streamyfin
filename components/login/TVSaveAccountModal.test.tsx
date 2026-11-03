import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { TV_PANEL_BACKING } from "@/constants/Colors";
import { TVSaveAccountModal } from "./TVSaveAccountModal";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
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

// Android TV does not blur what is behind a BlurView, it only tints it: the
// sign-in form's buttons showed through the sheet (seen on a Google TV
// Streamer, 2026-11-03).
test("the sheet draws a backing of its own over the form behind it", async () => {
  await render(
    <TVSaveAccountModal
      visible
      onClose={() => {}}
      onSave={() => {}}
      username='someone'
    />,
  );

  const panel = screen.getByTestId("tv-save-account-panel");
  expect(StyleSheet.flatten(panel.props.style).backgroundColor).toBe(
    TV_PANEL_BACKING,
  );
});
