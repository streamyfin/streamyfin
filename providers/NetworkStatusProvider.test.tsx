import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  NetworkStatusProvider,
  useNetworkStatus,
} from "./NetworkStatusProvider";

const mockProbe = jest.fn();
let mockNetState = { isConnected: true };

// Like the real library, a new subscriber is handed the current state at once.
const mockAddEventListener = jest.fn(
  (handler: (state: { isConnected: boolean }) => void) => {
    handler(mockNetState);
    return () => undefined;
  },
);

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: (handler: never) => mockAddEventListener(handler),
  },
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest
    .requireActual("jotai")
    .atom({ basePath: "https://jellyfin.example.com" }),
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock("@/utils/serverUrl/probes/jellyfin", () => ({
  jellyfinProbe: (...args: unknown[]) => mockProbe(...args),
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
    mockAddEventListener.mockClear();
    mockNetState = { isConnected: true };
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
