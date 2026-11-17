import {
  NO_REMOTE_PLAYBACK,
  type RemotePlaybackState,
} from "@/modules/mpv-player/src/cast/Cast.types";
import { makeApi } from "@/test-utils/jellyfinApi";
import { resolveRemoteItem } from "./resolveRemoteItem";

jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const tv = (state: Partial<RemotePlaybackState>): RemotePlaybackState => ({
  ...NO_REMOTE_PLAYBACK,
  connected: true,
  phase: "playing",
  ...state,
});

const resolve = (api: ReturnType<typeof makeApi>, state: RemotePlaybackState) =>
  resolveRemoteItem({ api, userId: "user-1" }, state);

test("an item the server returns is known", async () => {
  const api = makeApi();
  api.mock.onGet(/\/Items\/episode-1/).reply(200, {
    Id: "episode-1",
    Type: "Episode",
    MediaType: "Video",
  });
  const resolved = await resolve(api, tv({ itemId: "episode-1" }));
  expect(resolved).toMatchObject({
    kind: "known",
    item: { Id: "episode-1" },
  });
  // Under the account signed in on this phone.
  expect(api.mock.history.get[0].url).toContain("userId=user-1");
});

test("an audio item is music", async () => {
  const api = makeApi();
  api.mock
    .onGet(/\/Items\/track-1/)
    .reply(200, { Id: "track-1", Type: "Audio", MediaType: "Audio" });
  expect(await resolve(api, tv({ itemId: "track-1" }))).toMatchObject({
    kind: "music",
    item: { Id: "track-1" },
  });
});

// The receiver's item id does not say its server: another server's item is not this one's.
test("an item the server does not return is foreign, with the Cast title and image", async () => {
  const api = makeApi();
  api.mock.onGet(/\/Items\/other-1/).reply(404);
  const state = tv({
    itemId: "other-1",
    title: "Elephants Dream",
    imageUrl: "https://other.example.test/ed.jpg",
  });
  expect(await resolve(api, state)).toEqual({
    kind: "foreign",
    itemId: "other-1",
    title: "Elephants Dream",
    imageUrl: "https://other.example.test/ed.jpg",
  });
});

test("an unreachable server makes the item foreign", async () => {
  const api = makeApi();
  api.mock.onGet(/\/Items\/episode-1/).networkError();
  expect(
    await resolve(api, tv({ itemId: "episode-1", title: "Pilot" })),
  ).toMatchObject({ kind: "foreign", itemId: "episode-1", title: "Pilot" });
});

test("media without an item id is foreign and asks the server nothing", async () => {
  const api = makeApi();
  const state = tv({ foreign: true, title: "Big Buck Bunny", imageUrl: null });
  expect(await resolve(api, state)).toEqual({
    kind: "foreign",
    itemId: null,
    title: "Big Buck Bunny",
    imageUrl: null,
  });
  expect(api.mock.history.get).toEqual([]);
});

test("nothing loaded, or no session, is nothing", async () => {
  const api = makeApi();
  expect(await resolve(api, tv({ phase: "none" }))).toEqual({
    kind: "nothing",
  });
  expect(await resolve(api, tv({ phase: "ended" }))).toEqual({
    kind: "nothing",
  });
  expect(
    await resolve(api, { ...NO_REMOTE_PLAYBACK, itemId: "episode-1" }),
  ).toEqual({ kind: "nothing" });
  expect(api.mock.history.get).toEqual([]);
});
