// Which tab a route opens in, run through the linking Expo Router builds from
// the app's own routes. It lives here rather than under app/ because Expo
// Router turns every file there into a route.
import path from "node:path";
import { getLinkingConfig } from "expo-router/build/getLinkingConfig";
import { getRoutes } from "expo-router/build/getRoutes";
import requireContext from "expo-router/build/testing-library/require-context-ponyfill";
import { Platform } from "react-native";

const APP_DIR = path.join(__dirname, "..", "app");
// What a native bundle takes routes from (expo-router/_ctx.ios.js).
const NATIVE_ROUTE_FILE =
  /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)|(?:\+middleware)))\.[tj]sx?$).*\.[tj]sx?$/;

// The app's routes with every screen and layout stubbed: what matters is where
// a route lands, and the screens would pull in the whole app.
const appLinking = () => {
  const files = requireContext(APP_DIR, true, NATIVE_ROUTE_FILE);
  const context = Object.assign(() => ({ default: () => null }), {
    keys: files.keys,
    resolve: (key: string) => key,
    id: "0",
  });
  const routes = getRoutes(context as never, {
    skipGenerated: true,
    ignoreEntryPoints: true,
    platform: Platform.OS,
    preserveRedirectAndRewrites: true,
  });
  if (!routes) throw new Error("No routes found in app/");
  return getLinkingConfig(routes, context as never, {
    metaOnly: true,
    skipGenerated: false,
    sitemap: true,
    notFound: true,
  });
};

type NavigationState = {
  index?: number;
  routes: { name: string; state?: NavigationState }[];
};

const linking = appLinking();

/**
 * The tab group and the screen a push of `pathname` mounts, from the screen
 * whose segments are `from`: the router ranks the routes a path matches by how
 * many groups they share with where the app is.
 */
const landing = (pathname: string, from: string[]) => {
  let state = linking.getStateFromPath?.(
    pathname,
    linking.config,
    from as never,
  ) as NavigationState | undefined;
  const names: string[] = [];
  while (state) {
    const route = state.routes[state.index ?? state.routes.length - 1];
    names.push(route.name);
    state = route.state;
  }
  // ["__root", "(auth)/(tabs)", "(home)", "series/[id]"]
  return { tab: names[2], screen: names.at(-1) };
};

const IN = (tab: string, ...rest: string[]) => [
  "(auth)",
  "(tabs)",
  tab,
  ...rest,
];

describe("tab routes", () => {
  test("a page every tab shares opens in the tab it was opened from", () => {
    expect(landing("/series/1", IN("(home)"))).toEqual({
      tab: "(home)",
      screen: "series/[id]",
    });
    expect(landing("/series/1", IN("(libraries)", "[libraryId]")).tab).toBe(
      "(libraries)",
    );
    expect(landing("/series/1", IN("(search)")).tab).toBe("(search)");
    expect(landing("/series/1", IN("(more)", "favorites")).tab).toBe("(more)");
  });

  // Now Playing's Go to artist and Go to album push such a page from outside
  // the tabs, as does a link the app is opened with. The router then takes the
  // first group in file order: that was Favorites, which the phone's bar no
  // longer shows, and native tabs send a route without a tab back to Home with
  // the page dropped.
  test("opened from outside the tabs, it opens on Home", () => {
    expect(landing("/music/artist/1", ["(auth)", "now-playing"])).toEqual({
      tab: "(home)",
      screen: "music/artist/[artistId]",
    });
    expect(landing("/music/album/1", []).tab).toBe("(home)");
  });

  test("favorites, watchlists, sessions and settings are in the More tab", () => {
    for (const [pathname, screen] of [
      ["/favorites", "favorites/index"],
      ["/favorites/see-all", "favorites/see-all"],
      ["/watchlists", "watchlists/index"],
      ["/sessions", "sessions/index"],
      ["/settings", "settings"],
      ["/settings/logs/page", "settings/logs/page"],
      ["/companion-login", "companion-login"],
    ]) {
      expect(landing(pathname, IN("(home)"))).toEqual({
        tab: "(more)",
        screen,
      });
    }
  });

  test("a watchlist and its sheets open over the tab that asked for them", () => {
    expect(landing("/watchlists/7", IN("(home)"))).toEqual({
      tab: "(home)",
      screen: "watchlists/[watchlistId]",
    });
    expect(landing("/watchlists/7", IN("(more)", "watchlists")).tab).toBe(
      "(more)",
    );
    expect(
      landing("/watchlists/create", IN("(search)", "series", "[id]")),
    ).toEqual({ tab: "(search)", screen: "watchlists/create" });
    expect(
      landing(
        "/watchlists/edit/7",
        IN("(libraries)", "watchlists", "[watchlistId]"),
      ),
    ).toEqual({ tab: "(libraries)", screen: "watchlists/edit/[watchlistId]" });
  });

  // TV keeps favorites and watchlists as tabs of their own (utils/tvTabs.ts):
  // what they open stays in them, as it does in every other tab.
  test("an item opened from the TV's Favorites or Watchlists tab stays in it", () => {
    expect(landing("/series/1", IN("(tv-favorites)"))).toEqual({
      tab: "(tv-favorites)",
      screen: "series/[id]",
    });
    expect(landing("/watchlists/7", IN("(tv-watchlists)"))).toEqual({
      tab: "(tv-watchlists)",
      screen: "watchlists/[watchlistId]",
    });
    expect(
      landing(
        "/items/page",
        IN("(tv-watchlists)", "watchlists", "[watchlistId]"),
      ).tab,
    ).toBe("(tv-watchlists)");
  });

  test("downloads open in More from its menu, and on Home from anywhere else", () => {
    expect(landing("/downloads", IN("(more)"))).toEqual({
      tab: "(more)",
      screen: "downloads/index",
    });
    expect(landing("/downloads", IN("(libraries)", "[libraryId]")).tab).toBe(
      "(home)",
    );
  });
});
