import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { settingsAtom } from "@/utils/atoms/settings";
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
const mockUpdateSettings = jest.fn();

jest.mock("@/modules/mpv-player/src/cast", () => ({
  useRemoteTarget: () => mockTarget,
}));
// The stored settings, null until storage loads, and a new updateSettings at each render, as the real hook
// makes one.
jest.mock("@/utils/atoms/settings", () => ({
  settingsAtom: jest.requireActual("jotai").atom(null),
  useSettings: () => ({
    updateSettings: (update: object) => mockUpdateSettings(update),
  }),
}));

const store = getDefaultStore();
const stored = (quality: object | null) =>
  store.set(
    settingsAtom as never,
    (quality === null ? null : { remotePlaybackQuality: quality }) as never,
  );

beforeEach(() => {
  mockTarget = mockNone;
  stored(NO_REMOTE_QUALITY);
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
  stored({
    ...NO_REMOTE_QUALITY,
    known: [{ id: "device-a", name: "Salon", kind: "cast" }],
  });
  await render(<RemoteTargetMemory />);
  expect(mockUpdateSettings).not.toHaveBeenCalled();
});

// Forget this device works on the connected receiver too: a connection remembers, a settings change does not.
test("a receiver forgotten while connected stays forgotten", async () => {
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  stored({
    ...NO_REMOTE_QUALITY,
    known: [{ id: "device-a", name: "Salon", kind: "cast" }],
  });
  const view = await render(<RemoteTargetMemory />);
  await act(async () => stored(NO_REMOTE_QUALITY));
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

// Storage loads after the first render: a receiver already connected then (a JS reload over a live session)
// waits for it, so the write keeps the saved receivers and their quality.
test("a connection seen before the settings load waits for them", async () => {
  stored(null);
  mockTarget = { ...mockNone, state: "connected", target: mockSalon };
  await render(<RemoteTargetMemory />);
  const beforeTheLoad = mockUpdateSettings.mock.calls.length;
  const bedroom = { id: "device-b", name: "Bedroom", kind: "cast" };
  await act(async () =>
    stored({
      byKind: { cast: "4 Mb/s" },
      byTarget: { "device-b": "2 Mb/s" },
      known: [bedroom],
    }),
  );
  expect(beforeTheLoad).toBe(0);
  expect(mockUpdateSettings).toHaveBeenCalledWith({
    remotePlaybackQuality: {
      byKind: { cast: "4 Mb/s" },
      byTarget: { "device-b": "2 Mb/s" },
      known: [{ id: "device-a", name: "Salon", kind: "cast" }, bedroom],
    },
  });
});
