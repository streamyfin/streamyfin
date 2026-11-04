import { render, screen } from "@testing-library/react-native";
import type React from "react";
import { Pressable } from "react-native";
import { TVQRCodeDisplay } from "./TVQRCodeDisplay";

jest.mock("i18next", () => ({
  t: (key: string, params?: { server?: string }) =>
    params?.server ? `${key} (${params.server})` : key,
}));
jest.mock("@/hooks/useTVBackPress", () => ({ useTVBackPress: () => {} }));
// The real scale reads the settings atom, which loads the whole settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 20, heading: 28 }),
}));
// The real button's focus animation pulls in Reanimated.
jest.mock("@/components/tv/TVButton", () => ({
  TVButton: (props: { onPress: () => void; children: React.ReactNode }) =>
    MockTVButton(props),
}));
const MockTVButton = (props: {
  onPress: () => void;
  children: React.ReactNode;
}) => <Pressable onPress={props.onPress}>{props.children}</Pressable>;
jest.mock("react-native-qrcode-svg", () => ({
  __esModule: true,
  default: () => null,
}));

const renderTurnedOff = (serverName?: string) =>
  render(
    <TVQRCodeDisplay
      serverUrl='http://jellyfin.local:8096'
      serverName={serverName}
      code='123456'
      status='disabled'
      onNewCode={() => {}}
      onBack={() => {}}
    />,
  );

// The phone sheet and the TV's own alert name the server; this screen printed
// its address instead.
test("names the server Quick Connect is turned off on", async () => {
  await renderTurnedOff("Home");

  expect(
    screen.getByText("companion_login.error_quick_connect_disabled (Home)"),
  ).toBeTruthy();
});

test("falls back to the server's address when it has no name", async () => {
  await renderTurnedOff();

  expect(
    screen.getByText(
      "companion_login.error_quick_connect_disabled (http://jellyfin.local:8096)",
    ),
  ).toBeTruthy();
});
