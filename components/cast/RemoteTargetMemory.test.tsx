import { render } from "@testing-library/react-native";
import { NO_REMOTE_QUALITY } from "@/utils/cast/remoteQuality";
import { RemoteTargetMemory } from "./RemoteTargetMemory";

const mockSalon = {
  kind: "cast",
  id: "device-a",
  name: "Salon",
  capabilities: { volume: true },
};
const mockNone = {
  state: "none",
  target: null,
  reconnecting: false,
  error: null,
  volume: null,
  muted: false,
  errorCode: null,
  failedTarget: null,
};
let mockTarget: object = mockNone;
let mockQuality: object | undefined = NO_REMOTE_QUALITY;
const mockUpdateSettings = jest.fn();

jest.mock("@/modules/mpv-player/src/cast", () => ({
  useRemoteTarget: () => mockTarget,
}));
// A new updateSettings at each render, as the real hook makes one.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { remotePlaybackQuality: mockQuality },
    updateSettings: (update: object) => mockUpdateSettings(update),
  }),
}));

beforeEach(() => {
  mockTarget = mockNone;
  mockQuality = NO_REMOTE_QUALITY;
  mockUpdateSettings.mockClear();
});

// The remote quality settings list the receivers the app connected to.
test("a connection remembers the target", async () => {
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  await render(<RemoteTargetMemory />);
  expect(mockUpdateSettings).toHaveBeenCalledWith({
    remotePlaybackQuality: {
      ...NO_REMOTE_QUALITY,
      known: [{ id: "device-a", name: "Salon", kind: "cast" }],
    },
  });
});

test("a receiver still connecting is not remembered yet", async () => {
  mockTarget = { ...mockNone, state: "connecting", target: mockSalon };
  await render(<RemoteTargetMemory />);
  expect(mockUpdateSettings).not.toHaveBeenCalled();
});

// A connection to the receiver already first, under the same name, writes nothing.
test("the latest receiver again changes nothing", async () => {
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  mockQuality = {
    ...NO_REMOTE_QUALITY,
    known: [{ id: "device-a", name: "Salon", kind: "cast" }],
  };
  await render(<RemoteTargetMemory />);
  expect(mockUpdateSettings).not.toHaveBeenCalled();
});

// Forget this device works on the connected receiver too: a connection remembers, a settings change does not.
test("a receiver forgotten while connected stays forgotten", async () => {
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  mockQuality = {
    ...NO_REMOTE_QUALITY,
    known: [{ id: "device-a", name: "Salon", kind: "cast" }],
  };
  const view = await render(<RemoteTargetMemory />);
  mockQuality = NO_REMOTE_QUALITY;
  await view.rerender(<RemoteTargetMemory />);
  expect(mockUpdateSettings).not.toHaveBeenCalled();
});

// Connected again later, under the same name, the receiver is remembered again.
test("a forgotten receiver comes back with its next connection", async () => {
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  const view = await render(<RemoteTargetMemory />);
  mockUpdateSettings.mockClear();
  mockTarget = mockNone;
  await view.rerender(<RemoteTargetMemory />);
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  await view.rerender(<RemoteTargetMemory />);
  expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
});
