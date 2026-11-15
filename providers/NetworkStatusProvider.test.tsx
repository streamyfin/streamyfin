import NetInfo from "@react-native-community/netinfo";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { jellyfinProbe } from "@/utils/serverUrl/probes/jellyfin";
import {
  NetworkStatusProvider,
  useNetworkStatus,
} from "./NetworkStatusProvider";

const mockProbe = jest.mocked(jellyfinProbe);

let mockNetState = { isConnected: true };

const mockAddEventListener = NetInfo.addEventListener as jest.Mock;

jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest
    .requireActual("jotai")
    .atom({ basePath: "https://jellyfin.example.com" }),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ServerState = () => (
  <Text>{String(useNetworkStatus().serverConnected)}</Text>
);

const mount = async () => {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <NetworkStatusProvider>
        <ServerState />
      </NetworkStatusProvider>
    </QueryClientProvider>,
  );
  await act(async () => {});
};

describe("NetworkStatusProvider", () => {
  beforeEach(() => {
    mockProbe.mockReset();
    mockProbe.mockResolvedValue({ status: "ok" });
    mockNetState = { isConnected: true };
    // Like the real library, a new subscriber is handed the current state at once.
    mockAddEventListener.mockReset();
    mockAddEventListener.mockImplementation(
      (handler: (state: { isConnected: boolean }) => void) => {
        handler(mockNetState);
        return () => undefined;
      },
    );
  });

  // The subscription already delivers the current state, so a separate
  // NetInfo.fetch() sent every probe twice.
  it("probes the server once when it subscribes while connected", async () => {
    await mount();

    expect(mockProbe).toHaveBeenCalledTimes(1);
  });

  it("reports the server unreachable while the device is offline", async () => {
    mockNetState = { isConnected: false };

    await mount();

    expect(mockProbe).not.toHaveBeenCalled();
    expect(screen.getByText("false")).toBeTruthy();
  });
});
