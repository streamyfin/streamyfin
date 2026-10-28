import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { type CastDoubleState, createCastDoubleState } from "@/test-utils/cast";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useMusicCast } from "./useMusicCast";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const track = { Id: "track-1", Name: "Song", Type: "Audio" } as BaseItemDto;

beforeEach(() => {
  mockCast = createCastDoubleState();
});

// A phone whose Play Services are behind cannot cast: the SDK's own dialog says
// so, and the queue stays on the phone instead of reaching a receiver half way.
test("castQueue shows the Play Services dialog and returns false when they are outdated", async () => {
  mockCast.playServicesState = "updateRequired";
  const view = await renderHook(() =>
    useMusicCast({ api: makeApi(), userId: "user-1" }),
  );

  let result: boolean | undefined;
  await act(async () => {
    result = await view.result.current.castQueue({
      queue: [track],
      startIndex: 0,
    });
  });

  expect(result).toBe(false);
  expect(mockCast.dialogs).toEqual(["playServices:updateRequired"]);
  expect(mockCast.sent).toEqual([]);
});

test("isConnected follows the cast state", async () => {
  mockCast.castState = "notConnected";
  const view = await renderHook(() =>
    useMusicCast({ api: makeApi(), userId: "user-1" }),
  );
  expect(view.result.current.isConnected).toBe(false);
});
