// Spec for app/+native-intent.ts, run through the linking Expo Router builds
// from the app's own routes. It lives here rather than next to that file
// because Expo Router turns every file under app/ into a route.
import path from "node:path";
import { extractExpoPathFromURL } from "expo-router/build/fork/extractPathFromURL";
import { getLinkingConfig } from "expo-router/build/getLinkingConfig";
import { getRoutes } from "expo-router/build/getRoutes";
import requireContext from "expo-router/build/testing-library/require-context-ponyfill";
import { Linking, Platform } from "react-native";
import { stubReactNative } from "@/test-utils/reactNative";

type UrlListener = (event: { url: string }) => Promise<void> | void;

// The link the app receives, as Expo Router subscribes to it.
const mockUrlListeners: UrlListener[] = [];
let mockLaunchUrl: string | null = null;

jest.mock("expo-linking", () => ({
  ...jest.requireActual("expo-linking"),
  addEventListener: (_type: string, listener: UrlListener) => {
    mockUrlListeners.push(listener);
    return { remove: () => {} };
  },
  // iOS reads the link that launched the app from here, Android from React
  // Native's Linking.
  getLinkingURL: () => mockLaunchUrl,
}));

// Android opens the app with this link when the music notification or the
// system media controls are tapped: react-native-track-player's MusicService.
const MUSIC_NOTIFICATION_LINK = "trackplayer://notification.click";
const TOP_SHELF_LINK =
  "streamyfin://topshelf/item?id=f137a2dd21bbc1b99aa5c0f6bf02a805";

const APP_DIR = path.join(__dirname, "..", "app");
// What a native bundle takes routes from (expo-router/_ctx.ios.js).
const NATIVE_ROUTE_FILE =
  /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)|(?:\+middleware)))\.[tj]sx?$).*\.[tj]sx?$/;
const NATIVE_INTENT_FILE = /^\.\/\+native-intent\.[tj]sx?$/;

// The app's routes with every screen and layout stubbed: what matters is where
// a link lands, and the screens would pull in the whole app. The native intent
// is the one file loaded for real, found the way Expo Router finds it.
const appContext = () => {
  const files = requireContext(APP_DIR, true, NATIVE_ROUTE_FILE);
  return Object.assign(
    (key: string) =>
      NATIVE_INTENT_FILE.test(key) ? files(key) : { default: () => null },
    { keys: files.keys, resolve: (key: string) => key, id: "0" },
  );
};

const appLinking = () => {
  const context = appContext();
  const routes = getRoutes(context as never, {
    skipGenerated: true,
    ignoreEntryPoints: true,
    platform: Platform.OS,
    preserveRedirectAndRewrites: true,
  });
  if (!routes) throw new Error("No routes found in app/");
  // What the router store passes for this app, which sets none of them.
  return getLinkingConfig(
    routes,
    context as never,
    () => ({ segments: [] }) as never,
    { metaOnly: true, skipGenerated: false, sitemap: true, notFound: true },
  );
};

type NavigationState = {
  index?: number;
  routes: { name: string; params?: object; state?: NavigationState }[];
};

/** The focused route at each level of a state, outermost first. */
const focusedRoutes = (state: NavigationState | undefined) => {
  const routes: { name: string; params?: object }[] = [];
  let level = state;
  while (level) {
    const route = level.routes[level.index ?? level.routes.length - 1];
    routes.push(route);
    level = route.state;
  }
  return routes;
};

/** Where the app opens for a link: the routes Expo Router would mount. */
const landing = (
  linking: ReturnType<typeof appLinking>,
  url: string | null | undefined,
) => {
  if (typeof url !== "string") return [];
  const state = linking.getStateFromPath?.(
    `/${extractExpoPathFromURL(linking.prefixes, url)}`,
    linking.config,
  );
  return focusedRoutes(state as NavigationState | undefined);
};

/** Delivers a link to a running app, as Android does on a tap. */
const openWhileRunning = async (url: string) => {
  const navigate = jest.fn();
  appLinking().subscribe?.(navigate);
  await Promise.all(mockUrlListeners.map((listener) => listener({ url })));
  return navigate;
};

beforeEach(() => {
  stubReactNative({ OS: "android" });
  mockUrlListeners.length = 0;
  mockLaunchUrl = null;
});

// Why a link from outside the app can reach the library screen at all: the
// library route is a dynamic segment at the root of its tab, so Expo Router
// reads the host of a link it does not know as a library id.
test("a one-word link lands on the library screen with that word as its id", () => {
  const routes = landing(appLinking(), MUSIC_NOTIFICATION_LINK);

  expect(routes.at(-1)).toEqual(
    expect.objectContaining({
      name: "[libraryId]",
      params: expect.objectContaining({ libraryId: "notification.click" }),
    }),
  );
});

describe("the music notification", () => {
  // Sentry REACT-NATIVE-EM and EN: tapped while the app ran in the background,
  // it opened the library screen, which asked the server for the item
  // "notification.click".
  test("brings back a running app without taking it anywhere", async () => {
    const navigate = await openWhileRunning(MUSIC_NOTIFICATION_LINK);

    expect(navigate).not.toHaveBeenCalled();
  });

  test("starts the app on Android where the launcher would", async () => {
    jest
      .mocked(Linking.getInitialURL)
      .mockResolvedValueOnce(MUSIC_NOTIFICATION_LINK);
    const linking = appLinking();

    const launchedWith = await linking.getInitialURL?.();

    expect(landing(linking, launchedWith)).toEqual([]);
  });

  test("starts the app on iOS where the launcher would", () => {
    stubReactNative({ OS: "ios" });
    mockLaunchUrl = MUSIC_NOTIFICATION_LINK;
    const linking = appLinking();

    const launchedWith = linking.getInitialURL?.() as string | null;

    expect(landing(linking, launchedWith)).toEqual([]);
  });
});

describe("the app's own links", () => {
  test("still open their screen in a running app", async () => {
    const navigate = await openWhileRunning(TOP_SHELF_LINK);

    expect(navigate).toHaveBeenCalledWith(TOP_SHELF_LINK);
  });

  test("still start the app on their screen", async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValueOnce(TOP_SHELF_LINK);
    const linking = appLinking();

    const launchedWith = await linking.getInitialURL?.();

    expect(landing(linking, launchedWith).at(-1)?.name).toBe("topshelf/item");
  });
});
