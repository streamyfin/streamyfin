import { mock } from "bun:test";
import assert from "node:assert/strict";
import {
  TV_THEME_FADE_IN_MS,
  TV_THEME_FADE_OUT_MS,
} from "../constants/TVThemeMusic";

// Exercise the real hook's effects with deterministic timers. Audio methods
// model Expo's shared-session behavior, including pause's delayed deactivation.
let now = 0;
let timerId = 0;
const timers = new Map<number, { at: number; callback: () => void }>();
globalThis.setTimeout = ((callback: () => void, delay = 0) => {
  timers.set(++timerId, { at: now + delay, callback });
  return timerId;
}) as unknown as typeof setTimeout;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break;
    timers.delete(next[0]);
    now = next[1].at;
    next[1].callback();
    await flush();
  }
  now = end;
  await flush();
}

let nativeActive = false;
let enabled = true;
let audioSessionActive = true;
const sessionChanges: boolean[] = [];
let finishAudioMode: (() => void) | undefined;
const scenario = process.argv[2];
const players: ReturnType<typeof createPlayer>[] = [];
function createPlayer(keepAudioSessionActive: boolean) {
  return {
    isLoaded: true,
    playing: false,
    removed: false,
    loop: false,
    volume: 0,
    replacements: 0,
    play() {
      assert.equal(this.removed, false);
      this.playing = true;
      audioSessionActive = true;
    },
    pause() {
      this.playing = false;
      if (!keepAudioSessionActive) {
        setTimeout(() => {
          audioSessionActive = false;
          sessionChanges.push(false);
        }, 100);
      }
    },
    replace() {
      assert.equal(
        this.removed,
        false,
        "a cancelled start must not load a removed player",
      );
      this.replacements++;
    },
    remove() {
      this.removed = true;
    },
  };
}

mock.module("expo-audio", () => ({
  createAudioPlayer: (
    _source: unknown,
    options?: { keepAudioSessionActive?: boolean },
  ) => {
    const player = createPlayer(options?.keepAudioSessionActive ?? false);
    players.push(player);
    return player;
  },
  setIsAudioActiveAsync: async (active: boolean) => {
    audioSessionActive = active;
    sessionChanges.push(active);
  },
  setAudioModeAsync: () =>
    scenario === "pending-start"
      ? new Promise<void>((resolve) => {
          finishAudioMode = resolve;
        })
      : Promise.resolve(),
}));

type Effect = () => undefined | (() => void);
let nextEffect: Effect;
let cleanup: ReturnType<Effect>;
const playbackRef = { current: false };
mock.module("react", () => ({
  useEffect: (effect: Effect) => {
    nextEffect = effect;
  },
  useLayoutEffect: (effect: Effect) => {
    effect();
  },
  useRef: () => playbackRef,
}));
mock.module("react-native", () => ({ Platform: { isTV: true, OS: "ios" } }));
mock.module("expo-router", () => ({
  useSegments: () => ["(auth)", "(tabs)", "(home)", "items", "page"],
}));
const api = {
  basePath: "https://example.invalid",
  accessToken: "test",
  deviceInfo: { id: "test" },
};
mock.module("@/providers/JellyfinProvider", () => ({
  apiAtom: "api",
  userAtom: "user",
}));
mock.module("jotai", () => ({
  useAtom: (atom: string) => [atom === "api" ? api : { Id: "user" }],
}));
mock.module("@/providers/NativePlayerProvider", () => ({
  useNativePlayer: () => ({ isActive: nativeActive }),
}));
mock.module("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { tvThemeMusicEnabled: enabled } }),
}));
const songs = { Items: [{ Id: "theme" }] };
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({ data: songs }),
}));
mock.module("@jellyfin/sdk/lib/utils/api", () => ({
  getLibraryApi: () => ({}),
}));
const { useTVThemeMusic } = await import("../hooks/useTVThemeMusic");

async function render() {
  // biome-ignore lint/correctness/useHookAtTopLevel: This isolated harness provides React's hook lifecycle.
  useTVThemeMusic("movie");
  cleanup?.();
  cleanup = nextEffect();
  await flush();
}
await render();
const player = players[0];
if (scenario !== "pending-start") {
  await advance(scenario === "early-fade" ? 200 : TV_THEME_FADE_IN_MS);
  assert.equal(player.playing, true);
}

if (scenario === "browsing") {
  enabled = false;
  await render();
  await advance(TV_THEME_FADE_OUT_MS + 200);
  assert.equal(player.playing, false);
  assert.equal(player.removed, true);
  assert.equal(audioSessionActive, false, "idle browsing must release audio");
  enabled = true;
  await render();
  assert.equal(players.length, 2);
  assert.equal(players[1].playing, true);
  assert.equal(audioSessionActive, true, "a later theme must reactivate audio");
} else {
  if (scenario === "mid-fade" || scenario === "early-fade") {
    enabled = false;
    await render();
    await advance(200);
    assert.equal(player.playing, true);
  }
  nativeActive = true;
  audioSessionActive = true; // MPV has already activated the shared session.
  sessionChanges.length = 0;
  await render();
  await advance(200);
  assert.equal(player.playing, false, "theme must stop promptly");
  assert.equal(player.removed, true);
  finishAudioMode?.();
  await flush();
  await advance(TV_THEME_FADE_OUT_MS + 200);
  assert.equal(
    audioSessionActive,
    true,
    "theme cleanup must preserve MPV audio",
  );
  assert.equal(
    sessionChanges.includes(false),
    false,
    "no delayed session deactivation",
  );
  if (scenario === "pending-start") assert.equal(player.replacements, 0);
}
