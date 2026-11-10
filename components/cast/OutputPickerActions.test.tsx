import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Alert } from "react-native";
import type { CastMediaStatus } from "@/modules/mpv-player/src/cast";
import { CastNative } from "@/modules/mpv-player/src/cast/CastModule";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitCastEvent,
} from "@/test-utils/cast";
import { userAtom } from "@/utils/atoms/api";
import { settingsAtom } from "@/utils/atoms/settings";
import { choosePlay } from "@/utils/cast/playTarget";
import { logAndCaptureError } from "@/utils/log";
import { OutputPickerActions } from "./OutputPickerActions";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/atoms/api", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
jest.mock("@/utils/atoms/settings", () => {
  const { atom } = jest.requireActual("jotai");
  return { settingsAtom: atom(null) };
});
let mockSyncPlayEnabled = false;
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: mockSyncPlayEnabled }),
}));
const mockPlayMedia = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
const mockGetUserItemData = jest.fn();
jest.mock("@/utils/jellyfin/user-library/getUserItemData", () => ({
  getUserItemData: (...args: unknown[]) => mockGetUserItemData(...args),
}));

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockSyncPlayEnabled = false;
  getDefaultStore().set(settingsAtom, null);
  mockPlayMedia.mockClear();
  jest.mocked(CastNative!.requestMediaStatus).mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockGetUserItemData.mockReset();
  jest.mocked(logAndCaptureError).mockClear();
  getDefaultStore().set(userAtom, { Id: "user-1" } as never);
});

const episode = { Id: "item-1", Type: "Episode", MediaType: "Video" };

const receiverPlaying = (
  customData: Record<string, unknown>,
): CastMediaStatus => ({
  playerState: "playing",
  currentItemId: 1,
  streamPosition: 125.5,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  mediaInfo: { contentId: null, customData, metadata: null },
  customData: null,
});

const sheetAnswers = async (action: "remote" | "playHere") => {
  await act(async () =>
    emitCastEvent(mockCast, "onOutputPickerAction", { action }),
  );
};

const continueHereFromTheSheet = async () => {
  await render(<OutputPickerActions />);
  await sheetAnswers("playHere");
};

// Mounted once for the app, it answers each action once, whichever button opened the sheet.
test("remote opens the expanded controls", async () => {
  await render(<OutputPickerActions />);
  await sheetAnswers("remote");
  expect(mockCast.dialogs).toEqual(["expandedControls"]);
});

// The receiver forgets its item once stopped: it is read first, then stopped, and the phone plays it from there.
test("continue here stops the receiver, then plays here where it was", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    mediaSourceId: "source-1",
    audioStreamIndex: 2,
    subtitleStreamIndex: 3,
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue(episode);
  const stopsBeforePlay: number[] = [];
  mockPlayMedia.mockImplementationOnce(async () => {
    stopsBeforePlay.push(mockCast.disconnectCalls.length);
  });

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(stopsBeforePlay).toEqual([1]);
  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      itemId: "item-1",
      mediaSourceId: "source-1",
      audioIndex: 2,
      subtitleIndex: 3,
      playbackPositionTicks: 1_255_000_000,
      offline: false,
    }),
    expect.objectContaining({
      item: expect.objectContaining({ Id: "item-1" }),
    }),
  );
});

// The status held is the receiver's last report, which falls behind while it plays on (bench, 05/11: 19 s): the
// phone asks the receiver where it is now.
test("continue here goes on from where the receiver says it is when asked", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockCast.freshMediaStatus = {
    ...receiverPlaying({ itemId: "item-1", canClientSeek: true }),
    streamPosition: 177,
    approximateStreamPosition: 177.4,
  };
  mockGetUserItemData.mockResolvedValue(episode);

  await continueHereFromTheSheet();

  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({ playbackPositionTicks: 1_774_000_000 }),
    expect.anything(),
  );
});

test("an item this server does not know only stops the receiver", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "elsewhere-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockRejectedValue(
    Object.assign(new Error("Request failed with status code 404"), {
      response: { status: 404 },
    }),
  );

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(logAndCaptureError).not.toHaveBeenCalled();
});

// A lookup that fails otherwise (a timeout, a server error) is reported, and the receiver, not stopped yet, plays on.
test("an item lookup that fails is reported and leaves the receiver playing", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockRejectedValue(
    Object.assign(new Error("Request failed with status code 503"), {
      response: { status: 503 },
    }),
  );

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(logAndCaptureError).toHaveBeenCalledTimes(1);
  expect(Alert.alert).toHaveBeenCalledWith(
    "cast.output.continue_here",
    "cast.output.continue_here_failed",
  );
});

// The tap was for the receiver that was asked: another one by its answer is neither stopped nor played here.
test("a receiver switched while it was asked is left alone", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockCast.renewSessionOnStatusRequest = true;

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// The receiver's status cannot be read (an Android session suspended by the tap): nothing says what it plays, so it
// plays on and nothing starts here.
test("a receiver whose status cannot be read plays on", async () => {
  mockCast.mediaStatus = null;

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    "cast.output.continue_here",
    "cast.output.continue_here_failed",
  );
});

// A request that timed out, failed or outlived a resume answers the held report, which falls behind while the
// receiver plays on: where it is is unknown, so it plays on.
test("a receiver that did not answer plays on", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockCast.statusRequestAnswered = false;
  mockGetUserItemData.mockResolvedValue(episode);

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    "cast.output.continue_here",
    "cast.output.continue_here_failed",
  );
});

// A Play pressed while the receiver is asked is the last choice: the receiver keeps what that Play sent.
test("a play chosen meanwhile keeps the receiver", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockImplementation(async () => {
    choosePlay();
    return episode;
  });

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// One Continue here at a time: a second tap while the first runs would open a second player.
test("a second tap while one runs does nothing", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  let lookedUp: (item: typeof episode) => void = () => undefined;
  mockGetUserItemData.mockImplementation(
    () =>
      new Promise((resolve) => {
        lookedUp = resolve;
      }),
  );
  await render(<OutputPickerActions />);
  await sheetAnswers("playHere");
  await sheetAnswers("playHere");
  await act(async () => lookedUp(episode));

  expect(mockGetUserItemData).toHaveBeenCalledTimes(1);
  expect(mockPlayMedia).toHaveBeenCalledTimes(1);
});

// The lookup goes to the server of the account that tapped: another one by the status's answer looks nothing up.
test("an account switched while the receiver is asked looks nothing up", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  jest
    .mocked(CastNative!.requestMediaStatus)
    .mockImplementationOnce(async () => {
      getDefaultStore().set(userAtom, { Id: "user-2" } as never);
      return mockCast.mediaStatus;
    });

  await continueHereFromTheSheet();

  expect(mockGetUserItemData).not.toHaveBeenCalled();
  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// The quality the user caps streaming at applies here as on the item page.
test("continue here plays at the user's default quality", async () => {
  getDefaultStore().set(settingsAtom, {
    defaultBitrate: { key: "4 Mb/s", value: 4_000_000 },
  } as never);
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue(episode);

  await continueHereFromTheSheet();

  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({ bitrateValue: 4_000_000 }),
    expect.anything(),
  );
});

// The item looked up is the server's whole answer: the player takes it rather than fetching it again.
test("the item looked up goes to the player whole", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue(episode);

  await continueHereFromTheSheet();

  expect(mockPlayMedia).toHaveBeenCalledWith(expect.anything(), {
    item: episode,
    itemIsComplete: true,
  });
});

// The receiver's item belonged to the account that asked: another one by the end of the lookup plays nothing.
test("an account switched during the lookup plays nothing here", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockImplementation(async () => {
    getDefaultStore().set(userAtom, { Id: "user-2" } as never);
    return episode;
  });

  await continueHereFromTheSheet();

  expect(mockPlayMedia).not.toHaveBeenCalled();
});

const joinAGroupThenContinueHere = async () => {
  const view = await render(<OutputPickerActions />);
  mockSyncPlayEnabled = true;
  await view.rerender(<OutputPickerActions />);
  await sheetAnswers("playHere");
};

// A group joined while the sheet was open (a SyncPlay rejoin): its Continue here only stops the receiver, as a
// member's row does, and nothing plays here outside the group.
test("a group joined while the sheet is open only stops the receiver", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue(episode);

  await joinAGroupThenContinueHere();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// A member's tap is a stop, which needs nothing read first: the receiver is neither asked nor its item looked up.
test("a member's tap stops the receiver at once", async () => {
  mockCast.mediaStatus = null;

  await joinAGroupThenContinueHere();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(CastNative!.requestMediaStatus).not.toHaveBeenCalled();
  expect(mockGetUserItemData).not.toHaveBeenCalled();
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// Stopped meanwhile (from the TV, or at the end): nothing of ours to go on with, and the tap only stops it.
test("a receiver stopped meanwhile only stops", async () => {
  mockCast.mediaStatus = {
    ...receiverPlaying({ itemId: "item-1", canClientSeek: true }),
    playerState: "idle",
  };

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockGetUserItemData).not.toHaveBeenCalled();
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// Music comes back to the phone with its queue in B4: until then the receiver only stops.
test("music on the receiver only stops it", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "track-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue({
    Id: "track-1",
    Type: "Audio",
    MediaType: "Audio",
  });

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});
