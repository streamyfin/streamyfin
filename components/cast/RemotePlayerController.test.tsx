import type { Api } from "@jellyfin/sdk";
import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { RemotePlayerController } from "./RemotePlayerController";

const mockSent: unknown[] = [];
let mockRouted = true;
let mockDevice: object | null = {
  deviceId: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  friendlyName: "Living Room TV",
  modelName: "Chromecast",
  videoOut: true,
};

jest.mock("@/modules/mpv-player/src/cast", () => ({
  setRemoteServer: async (server: unknown) => {
    mockSent.push(server);
  },
  useCastDevice: () => mockDevice,
}));
jest.mock("@/utils/cast/remotePlayerGate", () => ({
  remotePlayerRouted: () => mockRouted,
}));

const store = getDefaultStore();
const signIn = () => {
  store.set(apiAtom, {
    basePath: "https://jellyfin.example.test",
    accessToken: "tok-123",
  } as Api);
  store.set(userAtom, { Id: "user-1" });
};

beforeEach(() => {
  mockSent.length = 0;
  mockRouted = true;
  mockDevice = {
    deviceId: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
    friendlyName: "Living Room TV",
    modelName: "Chromecast",
    videoOut: true,
  };
  signIn();
});

test("the controller gives native the server when the gate is open", async () => {
  await render(<RemotePlayerController />);
  expect(mockSent).toEqual([
    {
      serverAddress: "https://jellyfin.example.test",
      accessToken: "tok-123",
      userId: "user-1",
      receiverName: "Living Room TV",
    },
  ]);
});

test("it gives nothing in a release build", async () => {
  mockRouted = false;
  await render(<RemotePlayerController />);
  expect(mockSent).toEqual([]);
});

test("it clears the server on sign out", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    store.set(apiAtom, null);
    store.set(userAtom, null);
  });
  expect(mockSent.at(-1)).toBeNull();
});

// The receiver names its Jellyfin device from the envelope of every message: a new TV gets its own name.
test("another receiver gets the server again under its name", async () => {
  const { rerender } = await render(<RemotePlayerController />);
  mockDevice = { ...(mockDevice as object), friendlyName: "Bedroom TV" };
  await rerender(<RemotePlayerController />);
  expect(mockSent.at(-1)).toMatchObject({ receiverName: "Bedroom TV" });
});
