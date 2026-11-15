import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { getSSID } from "@/modules/wifi-ssid";
import { useWifiSsid, WifiSsidProvider } from "./WifiSsidProvider";

jest.mock("expo-location", () => ({
  PermissionStatus: { GRANTED: 1, DENIED: 2 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 1 })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 1 })),
}));

const CurrentWifi = () => {
  const { ssid, connectedToWifi } = useWifiSsid();
  return <Text>{connectedToWifi ? ssid : "offline"}</Text>;
};

test("reads the SSID after location permission is granted", async () => {
  jest.mocked(getSSID).mockResolvedValueOnce({
    ssid: "Home",
    connectedToWifi: true,
  });
  const view = await render(
    <WifiSsidProvider>
      <CurrentWifi />
    </WifiSsidProvider>,
  );
  try {
    await waitFor(() => expect(screen.getByText("Home")).toBeTruthy());
    expect(getSSID).toHaveBeenCalledTimes(1);
  } finally {
    await view.unmount();
  }
});
